import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
const testDir = mkdtempSync(path.join(os.tmpdir(), "workshop-browser-"));
const exportToken = "browser-export-token-with-more-than-24-characters";
const server = process.env.TEST_URL
  ? null
  : spawn(process.execPath, ["--experimental-strip-types", "server.ts"], {
      env: {
        ...process.env,
        PORT: "3102",
        DATA_DIR: testDir,
        NODE_ENV: "test",
        EXPORT_TOKEN: exportToken,
      },
      stdio: "pipe",
    });
const base = process.env.TEST_URL || "http://127.0.0.1:3102";
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base + "/health")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch({
  headless: true,
  channel: process.env.TEST_BROWSER_CHANNEL || "chrome",
});
const context = await browser.newContext({
  viewport: { width: 1487, height: 1058 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
mkdirSync("test-results", { recursive: true });
try {
  await page.goto(base+"/");
  assert.equal(await page.locator('a[href="/solo"]').count(),0);
  await page.goto(base+"/download");
  await page.getByRole('heading',{name:'数据下载与备份'}).waitFor();
  assert.equal(await page.locator('a[href="/solo"]').count(),0);
  await page.getByLabel('下载密钥').fill('wrong-token-with-more-than-24-characters');
  await page.locator('article').filter({hasText:'完整研究数据'}).getByRole('button',{name:'下载'}).click();
  await page.getByRole('status').filter({hasText:'下载密钥不正确'}).waitFor();
  await page.getByLabel('下载密钥').fill(exportToken);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('article').filter({hasText:'完整研究数据'}).getByRole('button',{name:'下载'}).click();
  const researchDownload=await downloadPromise;
  assert.equal(researchDownload.suggestedFilename(),'workshop.json');
  await page.goto(base+"/solo");
  await page.screenshot({ path: "test-results/consent-desktop.png" });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "同意并进入工作坊" }).click();
  for (let i = 0; i < 10; i++) {
    await page.locator(".bubble").click();
    await page.waitForTimeout(240);
  }
  await page.getByLabel("场景名称").fill("阿宝在通勤途中整理会议材料");
  await page.getByLabel("使用背景与材料").fill("地铁上单手使用手机，材料散落在相册、群聊和旧文档中");
  await page.getByLabel("期望目标").fill("将材料整合成可以继续修改的会议汇报初稿");
  await page.reload();
  await page.getByLabel("场景名称").waitFor();
  assert.equal(
    await page.getByLabel("场景名称").inputValue(),
    "阿宝在通勤途中整理会议材料",
  );
  await page.screenshot({ path: "test-results/scenario-desktop.png" });
  await page.getByRole("button",{name:"查看当前步骤帮助"}).click();
  await page.locator(".help-bubble .close").click();
  assert.equal(await page.locator(".help-bubble").count(), 0);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByLabel("困难名称").fill("文件散落在不同设备");
  await page
    .getByLabel("困难背景")
    .fill("阿宝需要电脑和手机上的文件，想一起上传给 AI。");
  await page
    .getByLabel("困难定义")
    .fill("由于文件分散在不同设备，造成上传前需要反复传递文件的困难。");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.locator(".viewport").waitFor();
  await page.locator(".save.saved").waitFor();
  await page.screenshot({ path: "test-results/canvas-primary.png" });
  assert.equal(
    await page
      .locator(".card-face.front")
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopWidth),
    "0px",
  );
  assert.equal(await page.locator(".card-art img.type-icon").count(), 2);
  assert.equal(await page.locator(".library-tabs").count(),0);
  await page.getByRole('button',{name:'我该做什么？'}).click();
  await page.getByRole('heading',{name:'请从自己的真实体验出发'}).waitFor();
  await page.getByText('结合你的亲身经历，构想一个在移动端使用 AI 的场景，再提出至少四个具体的困难。').waitFor();
  assert.equal(await page.getByText(/配置一个你亲身经历过的移动端/).count(),0);
  await page.screenshot({ path: "test-results/box-open-desktop.png" });
  await page.getByRole('button',{name:'开始构想'}).click();
  await page.locator(".timeline-card .front h3").first().click();
  await page.locator(".timeline-card.flipped").waitFor();
  await page.locator(".timeline-card.flipped .back").evaluate((element) => element.click());
  await page.getByRole('button',{name:/创建新困难/}).click();
  const sidePanel=page.locator('.board-editor-panel');await sidePanel.waitFor();
  assert.equal(await sidePanel.getByText(/继续构想|这里又发生|保留完整/).count(),0);
  const panelBox=await sidePanel.boundingBox(),panelViewport=page.viewportSize();assert(panelBox.x>=10&&panelViewport.width-panelBox.x-panelBox.width>=10);
  await page.getByLabel('困难名称').fill('上下文接不上');
  await page.getByLabel('困难背景').fill('阿宝出门后想在手机上继续电脑端的讨论');
  await page.getByLabel('困难定义').fill('由于设备间缺少对话背景，需要重新解释需求');
  await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.locator(".save.saved").waitFor();

  const before = await page.request.get(base + "/solo-api/me").then((r) => r.json());
  assert.equal(before.workspace.cards.length, 3);
  const difficultyCards = page.locator(".timeline-card.kind-2");
  const firstTitle = await difficultyCards.first().locator(".front h3").textContent();
  await difficultyCards.nth(1).dragTo(page.locator(".timeline-node").nth(1));
  await page.locator(".save.saved").waitFor();
  const moved = await page.request.get(base + "/solo-api/me").then((r) => r.json());
  assert.notEqual(moved.workspace.cards.filter((card) => card.kind === "困难卡")[0].title, firstTitle);
  assert.equal(await page.locator('.sequence-connector span').count(),0);
  assert.equal(await page.locator(".card.flipped").count(), 0);
  await page.locator(".card .front h3").first().click();
  await page.locator(".card.flipped").waitFor();
  await page
    .locator(".card.flipped")
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByLabel("场景名称").fill("阿宝的跨设备日常");
  await page.waitForTimeout(1600);
  const autoSaved = await page.request
    .get(base + "/solo-api/me")
    .then((r) => r.json());
  assert.equal(autoSaved.workspace.cards[0].title, "阿宝的跨设备日常");
  await page.getByRole("button", { name: "保存修改" }).click();
  assert.equal(await page.locator(".library-tabs").count(),0);
  await page.locator(".save.saved").waitFor();
  await page.screenshot({ path: "test-results/canvas-desktop.png" });
  await page.reload();
  await page.locator(".viewport").waitFor();
  assert.equal(await page.locator(".card").count(), 3);
  await context.setOffline(true);
  await page.getByRole("button", { name: /创建新困难/ }).click();
  await page.locator('.board-editor-panel').waitFor();
  await page.getByLabel("困难名称").fill("网络不稳定");
  await page.getByLabel("困难背景").fill("阿宝在地铁上");
  await page.getByLabel("困难定义").fill("由于网络中断造成无法上传");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.waitForTimeout(400);
  assert(
    await page
      .locator(".save")
      .textContent()
      .then((t) => t.includes("待重试")),
  );
  await context.setOffline(false);
  await page.locator(".save.saved").waitFor({ timeout: 10000 });
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.screenshot({ path: "test-results/canvas-tablet.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/canvas-mobile.png" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // A second page must not silently replace a workspace updated elsewhere.
  await page.goto(base+"/solo");
  await page.locator(".viewport").waitFor();
  const latest = await page.request.get(base + "/solo-api/me").then((r) => r.json());
  await page.request.put(base + "/solo-api/workspace", {
    data: { ...latest.workspace, view: { x: 25, y: 25, scale: 1 } },
  });
  await page.getByRole("button", { name: /创建新困难/ }).click();
  await page.getByLabel("困难名称").fill("版本冲突测试");
  await page.getByLabel("困难背景").fill("另一个页面刚刚更新");
  await page.getByLabel("困难定义").fill("由于版本变化造成保存冲突");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "加载最新版本" }).waitFor();
  assert(
    await page
      .getByRole("alert")
      .textContent()
      .then((t) => t.includes("其他页面已更新")),
  );
  // Touch-only tablet: task help remains directly accessible without edge card boxes.
  const touch = await browser.newContext({
    viewport: { width: 834, height: 1112 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  await touch.addCookies(await context.cookies());
  const tp = await touch.newPage();
  await tp.goto(base+"/solo");
  await tp.locator(".viewport").waitFor();
  await tp.getByRole('button',{name:'我该做什么？'}).tap();
  await tp.getByRole('heading',{name:'请从自己的真实体验出发'}).waitFor();
  await touch.close();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'加载最新版本'}).click();await page.locator('.save.saved').waitFor();await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:/创建新困难/}).click();
  await page.getByLabel('困难名称').fill('长内容困难');
  await page.getByLabel('困难背景').fill('在路上面对很多散落材料时，'.repeat(24));
  await page.getByLabel('困难定义').fill('需要逐项寻找、确认和重新组织，操作非常繁琐。'.repeat(24));
  await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.locator('.save.saved').waitFor();
  assert.equal(await page.locator('.timeline-card.kind-2').count(),4);
  const canvasBox=await page.locator('.viewport').boundingBox();
  const beforeTransform=await page.locator('.sequence-space').evaluate(element=>getComputedStyle(element).transform);
  await page.locator('.viewport').dispatchEvent('wheel',{deltaY:260,deltaX:0});await page.waitForTimeout(80);
  const afterTransform=await page.locator('.sequence-space').evaluate(element=>getComputedStyle(element).transform);
  assert.notEqual(afterTransform,beforeTransform);
  assert.equal(await page.locator('.timeline-card.kind-2').count(),4);
  assert.equal(await page.locator('.timeline-card.kind-2').last().locator('.front').evaluate(element=>getComputedStyle(element).overflow),'hidden');
  const longCard=page.locator('.timeline-card.kind-2').filter({hasText:'长内容困难'});
  assert.equal(await longCard.locator('.front').evaluate(element=>getComputedStyle(element).visibility),'visible');
  assert.equal(await longCard.locator('.back').evaluate(element=>getComputedStyle(element).visibility),'hidden');
  await longCard.locator('.front').click();
  assert.equal(await longCard.locator('.front').evaluate(element=>getComputedStyle(element).visibility),'hidden');
  assert.equal(await longCard.locator('.back').evaluate(element=>getComputedStyle(element).visibility),'visible');
  await longCard.locator('.back').evaluate(element=>element.click());
  await page.getByText('进入实验下一步').click();await page.locator('.picker').waitFor();assert.equal(await page.locator('.study-node').count(),0);
  assert.equal(await page.locator('.scene-option.office .reverse p').textContent(),'帮助阿宝在外出途中汇总微信会议录音、电脑端旧文献与参考海报，结合纸面手绘草图，按老板的模糊反馈快速修改汇报 PPT 与宣传图。');
  assert.equal(await page.locator('.scene-option.health .reverse p').textContent(),'帮助阿宝拍摄混合餐食与冰箱食材估算热量，结合记录与相册饮食打卡，在聚餐行程临时变化时动态调整减脂食谱与训练方案。');
  await page.locator('.scene-option.office .option-face').first().click();await page.locator('.scene-option.office').getByRole('button',{name:'开始',exact:true}).click();
  await page.locator('.solution-node-card').first().waitFor();
  assert.equal(await page.locator('.solution-node-card').count(),4);
  const submitBox=await page.getByRole('button',{name:'提交解法'}).boundingBox();assert(submitBox.y<100);assert(await page.getByRole('button',{name:'提交解法'}).isDisabled());
  const solutionViewport=await page.locator('.solution-viewport').boundingBox();
  const solutionBefore=await page.locator('.solution-space').evaluate(element=>getComputedStyle(element).transform);
  await page.locator('.solution-viewport').dispatchEvent('wheel',{deltaY:240,deltaX:0});await page.waitForTimeout(80);
  const solutionAfter=await page.locator('.solution-space').evaluate(element=>getComputedStyle(element).transform);
  assert.notEqual(solutionAfter,solutionBefore);
  await page.locator('.solution-viewport').dispatchEvent('wheel',{deltaY:-240,deltaX:0});await page.waitForTimeout(80);
  for(let i=0;i<4;i++){
    await page.locator('.solution-node-card').nth(i).click();
    if(i===0){
      await page.getByRole('button',{name:/交互卡箱/}).click();
      await page.locator('.design-box.amber .drawer-card').first().dragTo(page.locator('.solution-drop.interaction'));
      await page.locator('.solution-answer').first().waitFor();
      await page.getByRole('button',{name:/交互卡箱/}).click();
      await page.locator('.solution-drop.ai header button').click();
      await page.getByLabel('AI 功能名称').fill('材料语义归类');
      await page.getByLabel('AI 处理逻辑').fill('读取图片和文档内容，识别主题、时间与用途');
      await page.getByLabel('输出与交互配合').fill('输出可调整的分类标签，供用户拖拽确认');
    }else{
      await page.getByRole('button',{name:/交互卡箱/}).click();
      await page.locator('.design-box.amber .drawer-card.custom').first().getByRole('button',{name:'放入当前节点'}).click();
      await page.getByRole('button',{name:/交互卡箱/}).click();
    }
    if(await page.locator('.study-editor').count()){
      await page.locator('.study-editor').getByText('保存',{exact:true}).click();
      await page.locator('.study-editor').waitFor({state:'hidden'});
    }
    if(i===0){const dialog=page.locator('.solution-dialog');assert(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth));const dialogBox=await dialog.boundingBox(),vp=page.viewportSize();assert(dialogBox.x>=8&&vp.width-dialogBox.x-dialogBox.width>=8);await page.screenshot({path:'test-results/solution-expanded.png'});}
    await page.getByRole('button',{name:'完成当前节点'}).click();
    assert(await page.locator('.solution-node-column').nth(i).locator('.solution-titles button').count()>0);
  }
  assert(!(await page.getByRole('button',{name:'提交解法'}).isDisabled()));
  await page.screenshot({path:'test-results/solution-desktop.png'});
  await page.getByRole('button',{name:'提交解法'}).click();await page.getByRole('button',{name:'暂时没有，继续发布'}).click();await page.getByRole('button',{name:'定稿并发布给同伴'}).click();await page.getByRole('heading',{name:'选择一位同事的场景'}).waitFor();assert.equal(await page.locator('.peer-scene').count(),2);await page.getByRole('button',{name:'选择这个场景'}).first().click();await page.locator('.solution-node-card').first().waitFor();
  await page.locator('.solution-node-card').first().waitFor();
  const peerNodes=await page.locator('.solution-node-card').count();
  assert(peerNodes>=4);
  for(let i=0;i<peerNodes;i++){
    await page.locator('.solution-node-card').nth(i).click();
    await page.locator('.solution-drop.interaction header button').click();
    await page.getByLabel('交互名称').fill('同事节点交互'+i);
    await page.getByLabel('操作方式与反馈').fill('点按后标注目标，界面同步展示范围');
    await page.getByLabel('设计意图与效果').fill('降低选择负担并保留确认机会');
    await page.locator('.study-editor').getByText('保存',{exact:true}).click();
    await page.locator('.study-editor').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'完成当前节点'}).click();
  }
  await page.getByRole('button',{name:'提交解法'}).click();
  await page.locator('.submission-card').first().waitFor();
  assert.equal(await page.locator('.submission-card').count(),2);
  assert.equal(await page.locator('.submission-card .modified').count(),1);
  assert.equal(await page.locator('.submission-card .original').count(),1);
  for(let submission=0;submission<2;submission++){
    await page.locator('.submission-card').nth(submission).getByRole('button',{name:'查看并批阅'}).click();
    await page.locator('.study-node form').first().waitFor();
    await page.getByText(/这是一份单人测试示例提交/).first().waitFor();
    for(const form of await page.locator('.study-node form').all()){await form.locator('input[type=number]').fill(String(88-submission));await form.locator('textarea').fill('能够解决这个问题');await form.getByText('保存批阅').click();await form.getByText('更新批阅').waitFor();}
    await page.getByRole('button',{name:'返回方案列表'}).click();
    await page.locator('.submission-card').first().waitFor();
  }
  await page.getByRole('button',{name:'完成全部批阅'}).click();await page.getByText('实验已完成').waitFor();
  assert.equal((await page.request.get(base+'/api/me')).status(),401);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'重新开始',exact:true}).click();
  await page.getByRole('checkbox',{name:/我已阅读/}).waitFor();
  assert.equal((await page.request.get(base+'/solo-api/me')).status(),401);

  assert.deepEqual(errors, []);
  console.log(
    "PASS: complete browser journey, sequential reorder, task prompt, popup spacing, edit, refresh, offline retry, completion, reset, desktop/tablet/mobile and no runtime errors.",
  );
} finally {
  await browser.close();
  if (server && server.exitCode === null)
    await new Promise((r) => {
      server.once("exit", r);
      server.kill();
    });
  rmSync(testDir, { recursive: true, force: true });
}
