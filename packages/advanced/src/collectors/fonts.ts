import type { Collector } from './types';

const FONTS = [
  // Windows
  'Arial', 'Arial Black', 'Arial Narrow', 'Bahnschrift', 'Calibri', 'Cambria', 'Cambria Math', 'Candara', 'Comic Sans MS',
  'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia',
  'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic',
  'Microsoft Himalaya', 'Microsoft JhengHei', 'Microsoft New Tai Lue', 'Microsoft PhagsPa', 'Microsoft Sans Serif',
  'Microsoft Tai Le', 'Microsoft YaHei', 'Microsoft Yi Baiti', 'MingLiU-ExtB', 'Mongolian Baiti', 'MS Gothic', 'MV Boli',
  'Myanmar Text', 'Nirmala UI', 'Palatino Linotype', 'Segoe MDL2 Assets', 'Segoe Print', 'Segoe Script', 'Segoe UI',
  'Segoe UI Emoji', 'Segoe UI Historic', 'Segoe UI Symbol', 'SimSun', 'Sitka', 'Sylfaen', 'Symbol', 'Tahoma',
  'Times New Roman', 'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic',
  // macOS / iOS
  'American Typewriter', 'Andale Mono', 'Apple Chancery', 'Apple Color Emoji', 'Apple SD Gothic Neo', 'Avenir', 'Avenir Next',
  'Baskerville', 'Big Caslon', 'Brush Script MT', 'Chalkboard', 'Chalkduster', 'Cochin', 'Copperplate', 'Didot', 'Futura',
  'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Lucida Grande', 'Marker Felt', 'Menlo', 'Monaco',
  'Optima', 'Palatino', 'Papyrus', 'PingFang SC', 'Rockwell', 'SF Pro Display', 'SF Mono', 'Skia', 'Snell Roundhand', 'Zapfino',
  // Linux / Android / ChromeOS
  'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Droid Sans', 'Droid Serif', 'FreeMono', 'Liberation Mono',
  'Liberation Sans', 'Liberation Serif', 'Noto Color Emoji', 'Noto Sans', 'Noto Serif', 'Roboto', 'Ubuntu', 'Ubuntu Mono',
  'Open Sans', 'Lato', 'Source Sans Pro', 'Fira Code',
  // Office / Adobe / commonly installed
  'Garamond', 'Century Gothic', 'Bookman Old Style', 'Book Antiqua', 'Rockwell Extra Bold', 'Minion Pro', 'Myriad Pro',
  'Adobe Garamond Pro', 'Calisto MT', 'MS Reference Sans Serif',
];

const BASE = ['monospace', 'sans-serif', 'serif'];
const PROBE = 'mmMwWLliI0O&1lé中文';

export const fonts: Collector = {
  id: 'fonts',
  stable: true,
  bits: 8,
  timeoutMs: 4000,
  run() {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    const span = document.createElement('span');
    span.style.cssText = 'font-size:72px;white-space:nowrap;line-height:normal;letter-spacing:normal';
    span.textContent = PROBE;
    holder.appendChild(span);
    document.body.appendChild(holder);

    const measure = (family: string) => {
      span.style.fontFamily = family;
      return [span.offsetWidth, span.offsetHeight];
    };

    try {
      const base = BASE.map((b) => measure(b));
      const detected = FONTS.filter((font) =>
        BASE.some((b, i) => {
          const [w, h] = measure(`'${font}',${b}`);
          return w !== base[i][0] || h !== base[i][1];
        }),
      );
      return { tested: FONTS.length, detected, count: detected.length };
    } finally {
      holder.remove();
    }
  },
};

/** Fonts that the user has locally installed beyond the OS defaults need the Local Font Access API. */
export const localFonts: Collector = {
  id: 'localFonts',
  stable: true,
  bits: 6,
  optIn: true, // prompts the user for the "local-fonts" permission
  async run() {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
    if (!q) return { supported: false };
    const list = await q.call(window);
    const families = [...new Set(list.map((f) => f.family))].sort();
    return { supported: true, count: families.length, families };
  },
};
