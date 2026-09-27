import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const output = process.env.EXPENSE_QA_OUTPUT || '/tmp/sanad-expense-qa';
await mkdir(output, { recursive: true });
const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'preview:draft-editor'], { stdio: 'pipe' });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let browser, page;
let passed = 0;
const errors = [], outbound = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { const result = await fetch('http://127.0.0.1:3000'); if (result.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'fixture server ready');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'Asia/Aden' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { outbound.push(url.origin); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://127.0.0.1:3000');
  assert.match(await page.title(), /محرر المصروف/);
  const edit = () => page.getByRole('button', { name: 'تعديل المصروف', exact: true });
  const save = () => page.getByRole('button', { name: 'حفظ ومراجعة', exact: true });
  async function until(check) {
    for (let n = 0; n < 100; n++) { if (await check()) return; await page.waitForTimeout(50); }
    throw new Error('UI state did not settle');
  }
  async function scenario(name) {
    await page.getByLabel('حالة الاختبار').selectOption(name);
    await until(() => page.getByText('إصدار المسودة: 1', { exact: true }).isVisible());
    if (!['old-server','wrong-thread','commercial'].includes(name)) await until(() => edit().isEnabled());
  }
  async function open() {
    await edit().click();
    await until(() => page.getByLabel('المبلغ', { exact: true }).isEnabled());
  }
  function pass(name) { passed++; console.log('PASS', name); }
  await until(() => edit().isEnabled()); await open();
  assert.equal(await page.getByRole('button', { name: 'اعتماد', exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole('button', { name: 'إلغاء', exact: true }).isEnabled(), false);
  pass('editing blocks approval and cancellation');
  await page.getByLabel('المبلغ', { exact: true }).fill('١٥٠٫٧٥');
  await page.getByLabel('العملة', { exact: true }).selectOption('YER');
  assert.equal(await page.getByLabel('الحساب', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('الحساب', { exact: true }).locator('option[value="account-sar"]').count(), 0);
  pass('currency change clears account; never auto-selects or mixes currencies');
  await page.getByLabel('الحساب', { exact: true }).selectOption('account-yer');
  await page.getByLabel('التصنيف', { exact: true }).selectOption('category-travel');
  await page.getByLabel('الوصف (اختياري)', { exact: true }).fill('مصروف تنقلات');
  await page.screenshot({ path: `${output}/desktop-edit.png`, fullPage: true });
  await save().click();
  await until(() => page.getByText('إصدار المسودة: 2', { exact: true }).isVisible());
  let result = await page.evaluate(() => ({ row: window.expenseFixture.current(), calls: window.expenseFixture.calls }));
  assert.equal(result.row.id, '00000000-0000-4000-8000-000000000001'); assert.equal(result.row.payload.amount, '150.75');
  assert.equal(result.row.payload.currency, 'YER'); assert.equal(result.calls.lastVersion, 1);
  assert.equal(result.calls.cancel, 0); assert.equal(result.calls.approve, 0);
  assert.equal(result.row.payload.transaction_at, '2026-09-27T07:00:25+00:00');
  assert.equal(await page.getByText('150.75 YER', { exact: true }).isVisible(), true);
  pass('same-ID save shows returned review/version; no cancel or approval; exact timestamp preserved');
  await scenario('conflict'); await open(); await page.getByLabel('المبلغ', { exact: true }).fill('200'); await save().click();
  await page.getByText('تغيرت المسودة في مكان آخر.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('المبلغ', { exact: true }).inputValue(), '200'); assert.equal(await save().isEnabled(), false);
  await page.screenshot({ path: `${output}/conflict.png`, fullPage: true });
  await page.getByRole('button', { name: 'تحميل أحدث نسخة', exact: true }).click();
  await until(async () => await page.getByLabel('المبلغ', { exact: true }).inputValue() === '175');
  await page.getByRole('button', { name: 'تراجع', exact: true }).click();
  assert.equal(await page.getByText('إصدار المسودة: 2', { exact: true }).isVisible(), true);
  pass('conflict keeps inputs, blocks resubmit, explicit reload updates parent review too');
  await scenario('lost-response'); await open(); await page.getByLabel('المبلغ', { exact: true }).fill('210'); await save().click();
  await page.getByText('تعذر تأكيد الحفظ.', { exact: false }).waitFor();
  assert.equal(await save().isEnabled(), false);
  await page.getByRole('button', { name: 'تحميل أحدث نسخة', exact: true }).click();
  await until(() => save().isEnabled());
  result = await page.evaluate(() => ({ row: window.expenseFixture.current(), calls: window.expenseFixture.calls }));
  assert.equal(result.calls.save, 1); assert.equal(result.row.version, 2);
  pass('lost response reconciles by read, no automatic second mutation');
  for (const name of ['old-server','wrong-thread']) {
    await scenario(name); await page.waitForTimeout(450); assert.equal(await edit().isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: 'تعديل النص في المسودة نفسها' }).isVisible(), true);
    pass(name+' disables full edit without cancel/recreate fallback');
  }
  await page.getByLabel('حالة الاختبار').selectOption('late-capability');
  await page.getByRole('button', { name: 'تعديل النص في المسودة نفسها' }).click();
  await page.getByLabel('الوصف (500 حرف كحد أقصى)').fill('تعديل أثناء التحميل');
  await page.waitForTimeout(1800);
  assert.equal(await page.getByLabel('الوصف (500 حرف كحد أقصى)').isVisible(), true);
  await page.getByRole('button', { name: 'حفظ التعديل', exact: true }).click();
  await until(() => edit().isEnabled());
  pass('late capability never hides an open note editor or leaves controls locked');
  await scenario('commercial');
  assert.equal(await edit().count(), 0); assert.equal(await page.getByRole('button', { name: 'تعديل بقية البيانات' }).isVisible(), true);
  pass('commercial card retains its separate existing behavior');
  await scenario('empty'); await edit().click(); await page.getByText('لا توجد حسابات شخصية متاحة.', { exact: false }).waitFor(); assert.equal(await save().isEnabled(), false); pass('empty accounts block save');
  await scenario('lookup-error'); await edit().click(); await page.getByRole('button', { name: 'إعادة تحميل الخيارات' }).waitFor(); assert.equal(await save().isEnabled(), false); pass('lookup failure blocks save and offers retry');
  await scenario('missing-account'); await open(); await save().click(); await page.getByText('اختر حسابًا متاحًا بنفس عملة المصروف.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.expenseFixture.calls.save), 0); pass('unavailable original account is explicit and cannot be submitted');
  await scenario('collision'); await open(); await save().click(); await page.getByText('توجد مسودة نشطة مطابقة.', { exact: false }).waitFor(); assert.equal(await save().isEnabled(), false); pass('collision blocks retry without creating or cancelling drafts');
  await scenario('normal'); await open();
  await page.getByLabel('المبلغ', { exact: true }).focus(); await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('العملة', { exact: true }).evaluate(element => element === document.activeElement), true); pass('keyboard tab order');
  for (const width of [360,390,768,1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true }); pass('RTL no horizontal overflow '+width);
  }
  for (const zoom of [1.25,1.5]) {
    await page.evaluate(value => { document.body.style.zoom = String(value); }, zoom);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${output}/zoom-${zoom}.png`, fullPage: true }); pass('CSS zoom layout '+zoom);
  }
  assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  pass('no runtime/console errors, no outbound API requests');
  console.log(`Browser expense editor: ${passed} scenarios PASS; fixture adapter only, zero live financial operations.`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${output}/failure.txt`, `${String(error)}\n${errors.join('\n')}\n${await page.locator('body').innerText().catch(() => '')}`);
  }
  throw error;
} finally {
  await browser?.close(); server.kill();
}
