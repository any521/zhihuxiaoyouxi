/**
 * 远程执行助手（部署用）。
 *
 * 为什么要有它：Windows 上没有 sshpass，而 `plink` 支持 `-pw`；
 * 但在 PowerShell 里给 plink 传"带引号的远程命令"会被 shell 吃一层引号
 * （第一次试的时候 `hostname` 直接没输出）。这里用 `execFileSync` 直接传参数数组，
 * **不过 shell**，引号就不会被吃掉。
 *
 * 密码从环境变量 `LKS_SSH_PW` 读 —— **不写进这个文件**（免得密码跟着仓库走）。
 *
 * 用法：
 *   node 工具/远程.mjs sh "uname -a"                 # 执行远程命令
 *   node 工具/远程.mjs put <本地文件> <远程路径>        # 上传（pscp）
 *   node 工具/远程.mjs get <远程路径> <本地文件>        # 下载
 */
import { execFileSync } from 'node:child_process';

const 主机 = process.env.LKS_SSH_HOST ?? '47.120.12.99';
const 用户 = process.env.LKS_SSH_USER ?? 'root';
const 密码 = process.env.LKS_SSH_PW;
if (!密码) {
  console.error('缺少环境变量 LKS_SSH_PW（SSH 密码）');
  process.exit(2);
}

const [动作, 甲, 乙] = process.argv.slice(2);
/**
 * 服务器主机公钥指纹（**钉住它**）。
 *
 * ⚠️ plink 在 `-batch` 下拒绝"没见过的主机"。与其用 `echo y |` 盲目缓存，
 *    不如把指纹钉死 —— 这样连错机器会被直接拒绝（更安全，也是可复核的）。
 *    指纹是第一次连接时 plink 报出来的：
 *      ssh-ed25519 255 SHA256:RNFvNPJOYhac8vcs9lBsEfcMAjNxi/zcw8xSfznnEdQ
 *    ⚠️ 这只能防"中途换机器"，**证明不了这台机器就是你朋友的** ——
 *       要真正确认请用别的渠道核对这个指纹。
 */
const 指纹 = process.env.LKS_SSH_KEY ?? 'SHA256:RNFvNPJOYhac8vcs9lBsEfcMAjNxi/zcw8xSfznnEdQ';

const 公共 = ['-batch', '-hostkey', 指纹, '-pw', 密码, `${用户}@${主机}`];

function 跑(程序, 参数) {
  try {
    const 出 = execFileSync(程序, 参数, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(出);
  } catch (e) {
    if (e.stdout) process.stdout.write(String(e.stdout));
    if (e.stderr) process.stderr.write(String(e.stderr));
    process.exit(typeof e.status === 'number' ? e.status : 1);
  }
}

if (动作 === 'sh') {
  // ⚠️ 参数原样传给 plink，不经过 shell —— 远程命令里的引号不会被吃掉
  跑('plink', ['-ssh', ...公共, 甲]);
} else if (动作 === 'put') {
  跑('pscp', ['-batch', '-hostkey', 指纹, '-pw', 密码, 甲, `${用户}@${主机}:${乙}`]);
} else if (动作 === 'get') {
  跑('pscp', ['-batch', '-hostkey', 指纹, '-pw', 密码, `${用户}@${主机}:${甲}`, 乙]);
} else {
  console.error('用法：sh "<命令>" | put <本地> <远程> | get <远程> <本地>');
  process.exit(2);
}
