# SANAD / Edaa Soft — read-only host discovery probe
# Safety contract:
# - Reads HKCU Edaa configuration only.
# - Reads process/file metadata only.
# - Executes SELECT-only SQL statements against the local SQL Server.
# - Does not call SANAD Cloud, write SQLite state, modify Registry, attach/detach DBs, or run DML/DDL.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$registryPath = 'HKCU:\Software\VB and VBA Program Settings\prjAccountsContinuous12\File'
$registryValue = 'DefultDataBase'
$expectedExecutableName = 'prjAccountsContinuous12.exe'
$historicalExecutablePath = 'D:\ebs\sys\34229_Bahkam_Hone\prjAccountsContinuous12.exe'

$coreTables = @(
    'tblBranches',
    'tblCurrencies',
    'tblUsers',
    'tblAccounts',
    'tblAccountsInfo',
    'tblCustomersInfo',
    'tblCustomersAccounts',
    'tblClasses',
    'tblUnits',
    'tblSellInvoice',
    'tblSellInvoiceDetailes',
    'tblBuyInvoice',
    'tblBuyInvoiceDetailes',
    'tblEntries',
    'tblEntriesDetails',
    'tblClassEntries',
    'tblClassEntriesDetails',
    'tblHistory',
    'tblBackupCopies'
)

function Invoke-SelectTable {
    param(
        [Parameter(Mandatory = $true)] [System.Data.SqlClient.SqlConnection] $Connection,
        [Parameter(Mandatory = $true)] [string] $Sql,
        [hashtable] $Parameters
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 15
    if ($Parameters) {
        foreach ($key in $Parameters.Keys) {
            $null = $command.Parameters.AddWithValue($key, $Parameters[$key])
        }
    }

    $table = New-Object System.Data.DataTable
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
    $null = $adapter.Fill($table)
    $command.Dispose()
    $adapter.Dispose()
    return $table
}

function Invoke-SelectScalar {
    param(
        [Parameter(Mandatory = $true)] [System.Data.SqlClient.SqlConnection] $Connection,
        [Parameter(Mandatory = $true)] [string] $Sql
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $command.CommandTimeout = 15
    try {
        return $command.ExecuteScalar()
    }
    finally {
        $command.Dispose()
    }
}

function Normalize-PathValue {
    param([string] $Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }

    # SQL Server 2000 sysaltfiles can return legacy/padded metadata containing
    # control characters that modern Path.GetFullPath rejects. Discovery only
    # needs a stable case-insensitive comparison, so sanitize the SQL metadata
    # without resolving, touching, or rewriting any file-system path.
    $clean = $Path -replace '[\x00-\x1F]', ''
    $clean = $clean.Trim().Replace('/', '\')
    while ($clean.EndsWith('\')) {
        $clean = $clean.Substring(0, $clean.Length - 1)
    }
    return $clean.ToLowerInvariant()
}

function Get-Sha256Hex {
    param([string] $Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        return -join ($hash | ForEach-Object { $_.ToString('x2') })
    }
    finally {
        $sha.Dispose()
    }
}

Write-Host '=== SANAD / Edaa Soft READ-ONLY DISCOVERY ===' -ForegroundColor Cyan
Write-Host 'No ERP writes, no cloud calls, no Registry changes, no DB attach/detach.' -ForegroundColor Yellow

$result = [ordered]@{
    probe_version = '1.1'
    captured_at_utc = [DateTime]::UtcNow.ToString('o')
    machine_name = $env:COMPUTERNAME
    windows_user = [Environment]::UserName
    os_version = [Environment]::OSVersion.VersionString
    process_running = $false
    executable_path = $null
    executable_file_version = $null
    executable_product_version = $null
    executable_sha256 = $null
    registry_path = $registryPath
    registry_value = $registryValue
    registry_found = $false
    active_mdf_path = $null
    active_mdf_exists = $false
    sql_services = @()
    sql_connected = $false
    sql_server_version = $null
    database_name = $null
    schema_fingerprint = $null
    core_tables = @()
    warnings = @()
}

# 1) Detect the running Edaa process and executable metadata.
try {
    $process = Get-CimInstance Win32_Process -Filter "Name='$expectedExecutableName'" -ErrorAction Stop | Select-Object -First 1
    if ($process) {
        $result.process_running = $true
        $result.executable_path = $process.ExecutablePath
    }
}
catch {
    $result.warnings += 'Could not inspect Win32_Process; continuing with file/Registry discovery.'
}

if (-not $result.executable_path -and (Test-Path -LiteralPath $historicalExecutablePath -PathType Leaf)) {
    $result.executable_path = $historicalExecutablePath
}

if (-not $result.executable_path -and (Test-Path -LiteralPath 'D:\ebs\sys' -PathType Container)) {
    try {
        $candidate = Get-ChildItem -LiteralPath 'D:\ebs\sys' -Filter $expectedExecutableName -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($candidate) { $result.executable_path = $candidate.FullName }
    }
    catch {
        $result.warnings += 'Executable fallback scan could not complete.'
    }
}

if ($result.executable_path -and (Test-Path -LiteralPath $result.executable_path -PathType Leaf)) {
    try {
        $file = Get-Item -LiteralPath $result.executable_path
        $result.executable_file_version = $file.VersionInfo.FileVersion
        $result.executable_product_version = $file.VersionInfo.ProductVersion
        $result.executable_sha256 = (Get-FileHash -LiteralPath $result.executable_path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    catch {
        $result.warnings += 'Executable was found but version/hash metadata could not be read.'
    }
}

# 2) Read Edaa's active database pointer from HKCU.
try {
    $registry = Get-ItemProperty -LiteralPath $registryPath -Name $registryValue -ErrorAction Stop
    $mdfPath = [string]$registry.$registryValue
    if (-not [string]::IsNullOrWhiteSpace($mdfPath)) {
        $result.registry_found = $true
        $result.active_mdf_path = $mdfPath.Trim()
        $result.active_mdf_exists = Test-Path -LiteralPath $result.active_mdf_path -PathType Leaf
    }
}
catch {
    $result.warnings += 'Edaa DefultDataBase Registry value was not found for the current Windows user.'
}

# 3) Enumerate SQL services without changing them.
try {
    $services = Get-Service -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like 'MSSQL*' -or $_.Name -like 'SQLAgent*' -or $_.DisplayName -like '*SQL Server*'
    } | Sort-Object Name

    $result.sql_services = @($services | ForEach-Object {
        [ordered]@{
            name = $_.Name
            display_name = $_.DisplayName
            status = [string]$_.Status
        }
    })
}
catch {
    $result.warnings += 'SQL Server services could not be enumerated.'
}

# 4) Connect to local SQL Server using Windows integrated auth and SELECT only.
$master = $null
$db = $null
try {
    $masterConnectionString = 'Data Source=.;Initial Catalog=master;Integrated Security=SSPI;Connect Timeout=8;Application Name=SANAD Edaa ReadOnly Probe'
    $master = New-Object System.Data.SqlClient.SqlConnection $masterConnectionString
    $master.Open()
    $result.sql_connected = $true

    $version = Invoke-SelectScalar -Connection $master -Sql 'select @@version'
    if ($null -ne $version) {
        $result.sql_server_version = ([string]$version).Replace("`r", ' ').Replace("`n", ' ').Trim()
    }

    if ($result.active_mdf_path) {
        $dbFiles = Invoke-SelectTable -Connection $master -Sql @'
select d.name as database_name, f.filename as physical_name
from master..sysdatabases d
inner join master..sysaltfiles f on d.dbid = f.dbid
where f.fileid = 1
order by d.name
'@
        $expectedMdf = Normalize-PathValue $result.active_mdf_path
        foreach ($row in $dbFiles.Rows) {
            $physical = Normalize-PathValue ([string]$row.physical_name)
            if ($physical -and $expectedMdf -and $physical -eq $expectedMdf) {
                $result.database_name = [string]$row.database_name
                break
            }
        }
    }

    if ($result.database_name) {
        $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
        $builder.DataSource = '.'
        $builder.InitialCatalog = $result.database_name
        $builder.IntegratedSecurity = $true
        $builder.ConnectTimeout = 8
        $builder.ApplicationName = 'SANAD Edaa ReadOnly Probe'
        $db = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
        $db.Open()

        $columns = Invoke-SelectTable -Connection $db -Sql @'
select TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION,
       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
from INFORMATION_SCHEMA.COLUMNS
order by TABLE_NAME, ORDINAL_POSITION
'@

        $schemaParts = New-Object System.Collections.Generic.List[string]
        $tableResults = New-Object System.Collections.Generic.List[object]

        foreach ($tableName in $coreTables) {
            $matching = @($columns.Rows | Where-Object { [string]$_.TABLE_NAME -ieq $tableName })
            if ($matching.Count -eq 0) {
                $tableResults.Add([ordered]@{
                    table = $tableName
                    present = $false
                    row_count = $null
                    column_count = 0
                })
                continue
            }

            foreach ($column in ($matching | Sort-Object { [int]$_.ORDINAL_POSITION })) {
                $schemaParts.Add(('{0}|{1}|{2}|{3}|{4}' -f $tableName, [string]$column.COLUMN_NAME, [string]$column.DATA_TYPE, [string]$column.IS_NULLABLE, [string]$column.ORDINAL_POSITION))
            }

            $safeTableName = '[' + $tableName.Replace(']', ']]') + ']'
            $count = Invoke-SelectScalar -Connection $db -Sql ('select count(*) from ' + $safeTableName)
            $tableResults.Add([ordered]@{
                table = $tableName
                present = $true
                row_count = [int64]$count
                column_count = $matching.Count
            })
        }

        $result.core_tables = @($tableResults)
        $result.schema_fingerprint = Get-Sha256Hex (($schemaParts.ToArray()) -join "`n")
    }
    elseif ($result.active_mdf_path) {
        $result.warnings += 'The Registry MDF path is not currently attached to the local SQL Server instance.'
    }
}
catch {
    $result.warnings += ('Local SQL discovery failed: ' + $_.Exception.Message)
}
finally {
    if ($db) {
        try { $db.Close() } catch {}
        $db.Dispose()
    }
    if ($master) {
        try { $master.Close() } catch {}
        $master.Dispose()
    }
}

Write-Host ''
Write-Host '=== DISCOVERY RESULT (copy this whole JSON back to ChatGPT) ===' -ForegroundColor Green
$result | ConvertTo-Json -Depth 6
Write-Host ''
Write-Host 'Probe finished. No writes were issued to Edaa or SANAD Cloud.' -ForegroundColor Cyan
