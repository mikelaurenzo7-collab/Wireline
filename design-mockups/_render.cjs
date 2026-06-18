const { chromium } = require('playwright');
(async () => {
  const [,, target, w, h, out] = process.argv;
  const url = /^https?:\/\//.test(target) ? target : 'file://'+target;
  const b = await chromium.launch({ args:['--ignore-certificate-errors'] });
  const ctx = await b.newContext({ viewport:{width:+w,height:+h}, deviceScaleFactor:2, ignoreHTTPSErrors:true });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out });
  await b.close();
  console.log('rendered', out);
})();
