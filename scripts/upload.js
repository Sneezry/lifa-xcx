const fs = require('node:fs');
const path = require('node:path');
const ci = require('miniprogram-ci');
const { appid } = require('../project.config.json');
const { version } = require('../package.json');

async function deploy() {
  const privateKeyPath = process.env.WX_CI_PRIVATE_KEY_PATH;
  if (!privateKeyPath || !fs.existsSync(privateKeyPath) || !fs.statSync(privateKeyPath).isFile()) {
    throw new Error('请设置 WX_CI_PRIVATE_KEY_PATH 为现有的代码上传密钥文件路径');
  }

  const projectPath = path.resolve(__dirname, '..');
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*']
  });

  await ci.upload({
    project,
    version,
    desc: '力法许可小程序测试版',
    setting: { es6: true }
  });
  console.log(`小程序开发版 ${version} 已上传`);
}

deploy().catch((error) => {
  console.error('上传失败', error);
  process.exitCode = 1;
});
