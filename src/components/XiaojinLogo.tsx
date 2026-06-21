import xiaojinGif from '../assets/xiaojin.gif'
import xiaojinDarkGif from '../assets/xiaojin-dark.gif'

/**
 * 超级小金动态吉祥物 logo。
 * 亮主题用 xiaojin.gif（白底原版），暗主题用 xiaojin-dark.gif（深色背景版）。
 *
 * 实现方式：两张 <img> 同时挂在 DOM 中，由 src/index.css 通过
 *   .xiaojin-logo .xiaojin-dark { display: none; }
 *   html.dark .xiaojin-logo .xiaojin-light { display: none; }
 *   html.dark .xiaojin-logo .xiaojin-dark { display: block; }
 * 控制可见性。零 JS 监听，主题切换瞬时无闪烁。
 *
 * 两张 GIF 都通过 vite 静态 import，打包后是带 hash 的相对路径，
 * 在 file:// 协议下也能正确加载。
 */
export function XiaojinLogo({ size }: { size: number }) {
  // 注意：不要在这里写 display!
  // 内联 style 的 specificity 是 1000，会压过 .xiaojin-logo .xiaojin-dark { display: none }
  // 这条 CSS 规则（specificity 0020），导致亮/暗主题下两张图同时显示。
  // display 的显隐切换完全交给 src/index.css 里的 .xiaojin-logo / html.dark 规则控制。
  const imgStyle: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    objectFit: 'contain',
  }
  return (
    <span
      className="xiaojin-logo"
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
      aria-label="超级小金"
    >
      <img className="xiaojin-light" src={xiaojinGif} alt="" style={imgStyle} draggable={false} />
      <img className="xiaojin-dark" src={xiaojinDarkGif} alt="" style={imgStyle} draggable={false} />
    </span>
  )
}