from pathlib import Path
import os
import re


gradle = Path('android/app/build.gradle.kts')
text = gradle.read_text()
text = text.replace(
    'applicationId = "com.sanadflow.sanad_local"',
    'applicationId = "com.sanadflow.local"',
)
text = text.replace('minSdk = flutter.minSdkVersion', 'minSdk = 26')

release_key = Path(os.environ.get('SANAD_ANDROID_KEYSTORE_PATH', ''))
if release_key.is_file():
    signing = (
        '\n    signingConfigs {\n'
        '        create("sanadRelease") {\n'
        '            storeFile = file(System.getenv("SANAD_ANDROID_KEYSTORE_PATH"))\n'
        '            storePassword = System.getenv("SANAD_ANDROID_KEYSTORE_PASSWORD")\n'
        '            keyAlias = System.getenv("SANAD_ANDROID_KEY_ALIAS")\n'
        '            keyPassword = System.getenv("SANAD_ANDROID_KEY_PASSWORD")\n'
        '        }\n'
        '    }\n'
    )
    text = text.replace('\n    buildTypes {', signing + '\n    buildTypes {', 1)
    text = text.replace(
        'signingConfig = signingConfigs.getByName("debug")',
        'signingConfig = signingConfigs.getByName("sanadRelease")',
    )

dependency = 'cz.adaptech.tesseract4android:tesseract4android:4.9.0'
if dependency not in text:
    text += f'\n\ndependencies {{\n    implementation("{dependency}")\n}}\n'
gradle.write_text(text)

jitpack = 'maven { url = uri("https://jitpack.io") }'
root_gradle = Path('android/build.gradle.kts')
root_text = root_gradle.read_text()
if jitpack not in root_text:
    allprojects = root_text.index('allprojects {')
    anchor = root_text.index('repositories {', allprojects)
    insert_at = anchor + len('repositories {')
    root_text = root_text[:insert_at] + '\n        ' + jitpack + root_text[insert_at:]
root_gradle.write_text(root_text)

settings = Path('android/settings.gradle.kts')
settings_text = settings.read_text()
settings_text = re.sub(
    r'id\("com\.android\.application"\) version "[^"]+"',
    'id("com.android.application") version "8.11.2"',
    settings_text,
)
settings_text = re.sub(
    r'id\("org\.jetbrains\.kotlin\.android"\) version "[^"]+"',
    'id("org.jetbrains.kotlin.android") version "2.2.20"',
    settings_text,
)
if jitpack not in settings_text:
    if 'dependencyResolutionManagement {' in settings_text:
        anchor = settings_text.index(
            'repositories {',
            settings_text.index('dependencyResolutionManagement {'),
        )
        insert_at = anchor + len('repositories {')
        settings_text = settings_text[:insert_at] + '\n        ' + jitpack + settings_text[insert_at:]
    else:
        settings_text += (
            '\n\ndependencyResolutionManagement {\n'
            '    repositories {\n'
            '        google()\n'
            '        mavenCentral()\n'
            f'        {jitpack}\n'
            '    }\n'
            '}\n'
        )
settings.write_text(settings_text)

wrapper = Path('android/gradle/wrapper/gradle-wrapper.properties')
wrapper_text = wrapper.read_text()
wrapper_text = re.sub(
    r'gradle-[0-9.]+-(all|bin)\.zip',
    r'gradle-8.14.3-\1.zip',
    wrapper_text,
)
wrapper.write_text(wrapper_text)

# The Kotlin daemon repeatedly fails to accept local connections on some Windows
# development machines. Force in-process compilation there to avoid repeated
# daemon retries/fallbacks that can turn a debug build into a 30+ minute wait.
gradle_properties = Path('android/gradle.properties')
properties_text = gradle_properties.read_text()
if os.name == 'nt' and 'kotlin.compiler.execution.strategy=' not in properties_text:
    properties_text += '\nkotlin.compiler.execution.strategy=in-process\n'
if os.name == 'nt' and 'org.gradle.workers.max=' not in properties_text:
    properties_text += 'org.gradle.workers.max=2\n'
gradle_properties.write_text(properties_text)

manifest = Path('android/app/src/main/AndroidManifest.xml')
manifest_text = manifest.read_text()
application_marker = '<application'
permissions = (
    '    <uses-permission android:name="android.permission.CAMERA" />\n'
    '    <uses-permission android:name="android.permission.INTERNET" />\n'
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n'
)
if 'android.permission.CAMERA' not in manifest_text:
    manifest_text = manifest_text.replace(application_marker, permissions + application_marker, 1)

share_filter = '''
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
                <data android:mimeType="application/pdf" />
            </intent-filter>'''
if 'android.intent.action.SEND' not in manifest_text:
    activity_end = manifest_text.find('</activity>')
    if activity_end < 0:
        raise SystemExit('MainActivity closing tag not found')
    manifest_text = manifest_text[:activity_end] + share_filter + '\n        ' + manifest_text[activity_end:]

provider = '''
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/update_file_paths" />
        </provider>'''
if '${applicationId}.fileprovider' not in manifest_text:
    application_end = manifest_text.find('</application>')
    manifest_text = manifest_text[:application_end] + provider + '\n    ' + manifest_text[application_end:]
manifest.write_text(manifest_text)

xml = Path('android/app/src/main/res/xml')
xml.mkdir(parents=True, exist_ok=True)
(xml / 'update_file_paths.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <cache-path name="updates" path="." />\n'
    '</paths>\n'
)
