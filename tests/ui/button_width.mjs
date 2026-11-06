import { chromium } from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const browser=await chromium.launch({executablePath:'/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let checks=0;
const check=(ok,label)=>{if(!ok)throw Error(label);checks++;console.log(`ok ${label}`)};
try{
 for(const locale of ['en','pt-PT'])for(const width of [412,1280]){
  const page=await browser.newPage({viewport:{width,height:1100}});
  await page.goto(pathToFileURL(path.resolve(`build/button-width/${locale}.html`)).href);
  const box=async key=>page.locator(`[data-one="${key}"]`).boundingBox();
  const available=width-32;
  for(const key of ['normal','link','custom']){
   const b=await box(key);check(b&&b.width<available-20,`${locale}/${width} ${key} hugs content`);
  }
  for(const key of ['fill','row','row-fill','stack-fill']){
   const b=await box(key);check(b&&Math.abs(b.width-available)<2,`${locale}/${width} ${key} remains full width`);
  }
  check(Math.abs((await box('fixed')).width-240)<2,`${locale}/${width} explicit fixed width wins`);
  const long=await box('long'),short=await box('normal');
  check(long.width>short.width&&long.x+long.width<=width,`${locale}/${width} text determines width within viewport`);
  await page.close();
 }
 console.log(`PASS button-width ${checks} checks`);
}finally{await browser.close()}
