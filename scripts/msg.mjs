/**
 * 批处理里不方便写中文（cmd 会按控制台代码页解析 .cmd 文件，UTF-8 会变乱码并拆坏命令行），
 * 所以把中文提示放到这里，由 Node 打印——Node 在 Windows 控制台走宽字符接口，显示正常。
 *
 * 用法：node scripts/msg.mjs <key>
 */
const MESSAGES = {
  install_start: '\n  首次启动：正在安装依赖，需要联网，请稍候……\n',
  build_start: '\n  正在构建前端界面……\n',
  build_done: '  前端构建完成。\n',
  starting: '\n  启动 AnimeDaily……浏览器会自动打开 http://127.0.0.1:8787\n  关闭本窗口即停止服务。\n',
  build_fail: '\n  [X] 前端构建失败，请把上面的报错发给我。\n',
  help_phone: '  想在手机上看：启动后看下面打印的「手机/平板」地址。\n',
};

const key = process.argv[2] ?? '';
process.stdout.write(MESSAGES[key] ?? `unknown message: ${key}\n`);
