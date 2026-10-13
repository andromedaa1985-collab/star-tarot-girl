# Railstar 中文字体子集

`railstar-sans.woff2` 与 `railstar-serif.woff2` 是 Noto Sans SC、Noto Serif SC 的可变 WOFF2 子集，原字体版权属于 Adobe，使用 SIL Open Font License 1.1。完整许可证见 `OFL.txt`。修改后的字体重命名为 Railstar Sans / Railstar Serif，避免使用保留的字体名称。

来源：

- [Google Fonts Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)
- [Google Fonts Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc)

子集收录 `src/**/*.ts`、`src/**/*.tsx` 的现有字符，以及常用拉丁字符、标点与全角字符。它并不包含全部汉字；用户输入或新增文案中的缺字自动使用系统字体。界面通过 `src/fonts.css` 加载，本地托管，无外部字体请求。

如需更新，将官方 `NotoSansSC[wght].ttf`、`NotoSerifSC[wght].ttf` 下载到一个目录，分别命名为 `NotoSansSC.ttf`、`NotoSerifSC.ttf`，并放入同目录的官方 `OFL.txt`。安装 Python 的 `fonttools` 和 `brotli` 后，在仓库根目录执行：

```sh
python scripts/subset-ui-fonts.py /path/to/source-fonts
```

脚本会按当前源码重新生成两个字体和 `src/fonts.css`；将字体文件和文案改动一起提交即可。
