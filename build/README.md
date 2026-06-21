# build/ 资源占位

这个目录用于存放 electron-builder 打包时使用的图标和安装资源：

- `icon.ico`（Windows 应用图标，建议 256x256，多分辨率）
- `icon.png`（Linux 图标，512x512 PNG）
- `tray-icon.png`（系统托盘图标，16x16 + 32x32 双分辨率）
- `installerSidebar.bmp`（NSIS 安装器侧栏图，164x314 BMP，可选）

当前未提交真实图标文件——`electron-builder` 会自动使用 Electron 默认图标。
正式发布前替换这些文件即可。

替换流程：

1. 用任意工具（如 Figma、Photoshop）按上述尺寸导出
2. 文件名严格按上面命名
3. 放进 `build/` 目录
4. 重新打包：`npm run build:win`
