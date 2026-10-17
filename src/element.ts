import {
  assemblyGap,
  assemblySvg,
  BEDS,
  explodeOffset,
  JOINTS,
  jointIcon,
  splitSvg,
  zip,
  type Issue,
  type JointType,
  type Point,
  type Seams,
  type SplitOptions,
  type SplitResult,
} from './index.js';

export interface Sample {
  name: string;
  /** URL of the SVG, or the SVG markup itself. */
  svg: string;
  /** Options applied when the sample is chosen, such as a finished width or a joint. */
  options?: Partial<SplitOptions>;
}

export interface DownloadFile {
  name: string;
  type: string;
  data: string | Uint8Array;
}

type Unit = 'mm' | 'cm' | 'in';
const UNIT: Record<Unit, number> = { mm: 1, cm: 10, in: 25.4 };
const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS = `
:host{--ls-accent:#d4572a;--ls-accent-ink:#fff;--ls-bg:#f6f2ec;--ls-surface:#fffdf9;--ls-ink:#221c16;--ls-muted:#75685b;--ls-line:#e4dbcf;--ls-wood:#efd3a6;--ls-wood-2:#e2bd86;--ls-radius:14px;--ls-font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
display:block;container-type:inline-size;font-family:var(--ls-font);color:var(--ls-ink);background:var(--ls-bg);border-radius:var(--ls-radius);font-size:14px;line-height:1.4}
@media (prefers-color-scheme:dark){:host(:not([theme=light])){--ls-bg:#191512;--ls-surface:#231e1a;--ls-ink:#f3ebe1;--ls-muted:#b3a597;--ls-line:#3a312a;--ls-wood:#c9a578;--ls-wood-2:#b48b5b}}
:host([theme=dark]){--ls-bg:#191512;--ls-surface:#231e1a;--ls-ink:#f3ebe1;--ls-muted:#b3a597;--ls-line:#3a312a;--ls-wood:#c9a578;--ls-wood-2:#b48b5b}
*{box-sizing:border-box}
.ls{display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:16px;padding:16px;min-height:520px}
@container (max-width:780px){.ls{grid-template-columns:1fr}}
.panel{display:flex;flex-direction:column;gap:12px}
.card{background:var(--ls-surface);border:1px solid var(--ls-line);border-radius:calc(var(--ls-radius) - 4px);padding:14px}
.card h3{margin:0 0 10px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ls-muted);font-weight:650}
.row{display:flex;gap:8px;align-items:center}
.row+.row{margin-top:8px}
label.f{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ls-muted);flex:1;min-width:0}
input,select,button{font:inherit;color:inherit}
input[type=number],select{width:100%;padding:8px 10px;border:1px solid var(--ls-line);border-radius:9px;background:var(--ls-bg);min-width:0}
input[type=range]{width:100%;accent-color:var(--ls-accent)}
input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--ls-accent);outline-offset:1px}
.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed var(--ls-line);border-radius:10px;padding:18px 10px;text-align:center;cursor:pointer;color:var(--ls-muted);transition:border-color .15s,background .15s}
.drop strong{color:var(--ls-ink)}
.drop.over,.drop:hover{border-color:var(--ls-accent);background:color-mix(in srgb,var(--ls-accent) 7%,transparent)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{border:1px solid var(--ls-line);background:var(--ls-bg);border-radius:999px;padding:5px 11px;cursor:pointer;font-size:13px}
.chip[aria-pressed=true]{border-color:var(--ls-accent);color:var(--ls-accent);font-weight:600}
.joints{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.joint{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 5px;border:1px solid var(--ls-line);border-radius:10px;background:var(--ls-bg);cursor:pointer;font-size:12px}
.joint svg{width:100%;height:30px}
.joint svg path{fill:none;stroke:var(--ls-ink);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.joint[aria-pressed=true]{border-color:var(--ls-accent);background:color-mix(in srgb,var(--ls-accent) 9%,var(--ls-surface));font-weight:650}
.joint[aria-pressed=true] svg path{stroke:var(--ls-accent)}
.hint{font-size:12px;color:var(--ls-muted);margin:8px 0 0}
.toggle{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
.toggle input{accent-color:var(--ls-accent);width:16px;height:16px}
details summary{cursor:pointer;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ls-muted);font-weight:650;list-style:none}
details summary::after{content:" +"}details[open] summary::after{content:" \\2212"}
details[open] summary{margin-bottom:10px}
.main{display:flex;flex-direction:column;gap:12px;min-width:0}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.stats{display:flex;flex-wrap:wrap;gap:6px}
.stat{background:var(--ls-surface);border:1px solid var(--ls-line);border-radius:999px;padding:5px 12px;font-size:13px}
.stat b{font-variant-numeric:tabular-nums}
.tabs{display:flex;background:var(--ls-surface);border:1px solid var(--ls-line);border-radius:999px;padding:3px}
.tab{border:0;background:none;padding:5px 14px;border-radius:999px;cursor:pointer;font-size:13px;color:var(--ls-muted)}
.tab[aria-selected=true]{background:var(--ls-ink);color:var(--ls-surface)}
.stage{position:relative;background:var(--ls-surface);border:1px solid var(--ls-line);border-radius:calc(var(--ls-radius) - 4px);padding:14px;min-height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stage>svg{width:100%;height:auto;max-height:68vh;display:block;touch-action:none}
.stage.busy::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--ls-surface) 45%,transparent)}
.empty{color:var(--ls-muted);text-align:center;max-width:320px}
.seam line.hit{stroke:transparent;cursor:ew-resize;pointer-events:stroke}
.seam.y line.hit{cursor:ns-resize}
.seam line.show{stroke:var(--ls-accent);stroke-dasharray:6 5;opacity:0;transition:opacity .15s;pointer-events:none}
.seam:hover line.show,.seam.drag line.show{opacity:1}
.seam circle{fill:var(--ls-accent);stroke:var(--ls-surface);pointer-events:none}
.seam text{fill:var(--ls-accent-ink);font:600 11px var(--ls-font);pointer-events:none}
.marker{fill:none;stroke:#d23c2e;stroke-width:2;vector-effect:non-scaling-stroke}
.sheets{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;width:100%;align-self:start}
.sheet{border:1px solid var(--ls-line);border-radius:10px;padding:10px;background:var(--ls-bg);display:flex;flex-direction:column;gap:8px}
.sheet .bed{background:color-mix(in srgb,var(--ls-muted) 10%,var(--ls-surface));border-radius:6px;outline:1px dashed var(--ls-line)}
.sheet .bed svg{display:block;width:100%;height:auto}
.sheet .bed svg #cut path{fill:var(--ls-wood);stroke:#7a4b26;stroke-width:1px;vector-effect:non-scaling-stroke}
.sheet .bed svg #engrave path[fill=none]{stroke-width:1px;vector-effect:non-scaling-stroke}
.sheet .bed svg #labels path{stroke:#2148c0;stroke-width:1.2px;vector-effect:non-scaling-stroke}
.sheet .meta{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--ls-muted)}
.sheet .meta b{color:var(--ls-ink)}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ls-line);background:var(--ls-surface);border-radius:999px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:600}
.btn.primary{background:var(--ls-accent);border-color:var(--ls-accent);color:var(--ls-accent-ink)}
.btn.small{padding:4px 10px;font-size:12px}
.btn:disabled{opacity:.5;cursor:default}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.issues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.issues li{background:var(--ls-surface);border:1px solid var(--ls-line);border-left:3px solid #e0a020;border-radius:8px;padding:7px 10px;font-size:13px}
.issues li.bad{border-left-color:#d23c2e}
.error{color:#d23c2e;font-size:13px;margin:8px 0 0}
.legend{font-size:12px;color:var(--ls-muted)}
[hidden]{display:none!important}
`;

const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

const num = (v: string | null, fallback: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const fmt = (mm: number, unit: Unit, digits = unit === 'mm' ? 0 : 1) =>
  `${(mm / UNIT[unit]).toFixed(digits)} ${unit}`;

/**
 * `<laser-split>`: drop in an SVG, choose the finished size, the laser bed and a joint, and
 * download sheets that fit the bed. Drag the dashed seams in the assembly view to move them.
 */
export class LaserSplitElement extends Base {
  static get observedAttributes() {
    return [
      'src',
      'width',
      'unit',
      'bed',
      'joint',
      'joint-size',
      'joint-depth',
      'kerf',
      'clearance',
      'margin',
      'backers',
      'labels',
      'hide',
      'filename',
    ];
  }

  private root!: ShadowRoot;
  private source = '';
  private name = 'design';
  private manualSeams: Seams | undefined;
  private current: SplitResult | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private view: 'assembly' | 'sheets' = 'assembly';
  private sampleList: Sample[] = [];
  private activeSample = -1;
  private ready = false;
  private state = {
    width: 1000,
    unit: 'mm' as Unit,
    bed: '12x20in',
    bedW: 508,
    bedH: 304.8,
    joint: 'puzzle' as JointType,
    jointSize: 0,
    jointDepth: 0,
    kerf: 0.15,
    clearance: 0.1,
    margin: 5,
    backers: 0,
    labels: true,
    rotate: true,
  };

  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.readAttributes();
    this.render();
    const src = this.getAttribute('src');
    if (src) void this.load(src);
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (!this.ready || old === value) return;
    if (name === 'src' && value) {
      void this.load(value);
      return;
    }
    this.readAttributes();
    if (name === 'hide') this.render();
    else this.syncControls();
    this.schedule(true);
  }

  /** The SVG being split. Setting it replaces the design and resets the seams. */
  get svg() {
    return this.source;
  }
  set svg(value: string) {
    this.source = value;
    this.manualSeams = undefined;
    this.schedule(true, 0);
  }

  /** Example designs offered as chips under the drop zone. */
  get samples() {
    return this.sampleList;
  }
  set samples(list: Sample[]) {
    this.sampleList = list ?? [];
    if (this.ready) this.render();
  }

  /** The latest result, or undefined before a design is loaded. */
  get result() {
    return this.current;
  }

  /** The options the next split will use. */
  get options(): SplitOptions {
    const s = this.state;
    return {
      width: s.width,
      bed: { width: s.bedW, height: s.bedH },
      joint: s.joint,
      jointSize: s.jointSize || undefined,
      jointDepth: s.jointDepth || undefined,
      kerf: s.kerf,
      clearance: s.clearance,
      margin: s.margin,
      backers: s.backers || undefined,
      labels: s.labels,
      rotate: s.rotate,
      seams: this.manualSeams,
    };
  }

  /** Load an SVG from a URL or from markup. */
  async load(svgOrUrl: string, name?: string) {
    try {
      const text = svgOrUrl.trim().startsWith('<')
        ? svgOrUrl
        : await (await fetch(svgOrUrl)).text();
      this.name =
        (
          name ??
          svgOrUrl
            .split('/')
            .pop()
            ?.replace(/\.svg$/i, '') ??
          'design'
        ).slice(0, 60) || 'design';
      this.svg = text;
    } catch (error) {
      this.showError(error);
    }
  }

  /** Split now with the current settings. */
  split(): SplitResult | undefined {
    if (!this.source) return undefined;
    const busy = this.$('.stage');
    try {
      this.current = splitSvg(this.source, this.options);
      this.showError(undefined);
    } catch (error) {
      this.current = undefined;
      this.showError(error);
    }
    busy?.classList.remove('busy');
    this.paint();
    this.dispatchEvent(
      new CustomEvent('split', { detail: { result: this.current, options: this.options } }),
    );
    return this.current;
  }

  /** Every file a maker needs: one SVG per sheet, the assembly map and a short readme. */
  files(): DownloadFile[] {
    const r = this.current;
    if (!r) return [];
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      ...r.sheets.map((s) => ({
        name: `${this.name}-sheet-${pad(s.index + 1)}.svg`,
        type: 'image/svg+xml',
        data: s.svg,
      })),
      { name: `${this.name}-assembly.svg`, type: 'image/svg+xml', data: r.assembly },
      { name: 'README.txt', type: 'text/plain', data: this.readme(r) },
    ];
  }

  /** Download one file, or all of them as a zip. Hosts can cancel the `download` event to handle it. */
  download(which: 'all' | number | 'assembly' = 'all') {
    const all = this.files();
    if (!all.length) return;
    const pick =
      which === 'all'
        ? [
            {
              name: `${this.name}-split.zip`,
              type: 'application/zip',
              data: zip(all.map((f) => ({ name: f.name, data: f.data }))),
            },
          ]
        : which === 'assembly'
          ? all.filter((f) => f.name.endsWith('-assembly.svg'))
          : [all[which]];
    const event = new CustomEvent('download', {
      detail: { files: pick, all },
      cancelable: true,
    });
    if (!this.dispatchEvent(event)) return;
    for (const f of pick) {
      const blob = new Blob([f.data as BlobPart], { type: f.type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  }

  private readme(r: SplitResult) {
    const pieces = r.parts.filter((p) => p.kind === 'piece').length;
    const keys = r.parts.filter((p) => p.kind === 'key').length;
    const backers = r.parts.filter((p) => p.kind === 'backer').length;
    return [
      `${this.name}: ${pieces} pieces${keys ? `, ${keys} keys` : ''}${backers ? `, ${backers} backer strips` : ''} on ${r.sheets.length} sheets`,
      `Finished size ${r.width.toFixed(1)} x ${r.height.toFixed(1)} mm. Sheet size ${r.bed.width.toFixed(1)} x ${r.bed.height.toFixed(1)} mm.`,
      '',
      'Layers in every sheet file:',
      '  cut (red #ff0000): cut through',
      '  engrave (original colours): artwork from your design',
      '  labels (blue #0000ff): piece names. Score lightly, engrave on the back, or switch the layer off.',
      '',
      'Open the assembly map to see where each piece goes. Rows are letters from the top, columns are numbers from the left.',
      keys
        ? 'K parts are butterfly keys: press them into the bow-tie pockets across the seams.'
        : '',
      backers ? 'S parts are backer strips: glue them behind the seams.' : '',
      '',
      'Made with laser-split by MyLaserTools: https://github.com/mylasertools-com/laser-split',
      '',
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join('\n');
  }

  private readAttributes() {
    const s = this.state;
    const unit = this.getAttribute('unit');
    if (unit === 'mm' || unit === 'cm' || unit === 'in') s.unit = unit;
    s.width = num(this.getAttribute('width'), s.width);
    const bed = this.getAttribute('bed');
    if (bed) this.setBed(bed);
    const joint = this.getAttribute('joint') as JointType | null;
    if (joint && JOINTS.some((j) => j.id === joint)) s.joint = joint;
    s.jointSize = num(this.getAttribute('joint-size'), s.jointSize);
    s.jointDepth = num(this.getAttribute('joint-depth'), s.jointDepth);
    s.kerf = num(this.getAttribute('kerf'), s.kerf);
    s.clearance = num(this.getAttribute('clearance'), s.clearance);
    s.margin = num(this.getAttribute('margin'), s.margin);
    s.backers = num(this.getAttribute('backers'), s.backers);
    s.labels = this.getAttribute('labels') !== 'off';
    const file = this.getAttribute('filename');
    if (file) this.name = file;
  }

  private setBed(value: string) {
    const preset = BEDS.find((b) => b.id === value);
    const s = this.state;
    if (preset) {
      s.bed = preset.id;
      s.bedW = preset.width;
      s.bedH = preset.height;
      return;
    }
    const m = /^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)?$/i.exec(value.trim());
    if (m) {
      const k = UNIT[(m[3]?.toLowerCase() as Unit) ?? 'mm'];
      s.bed = 'custom';
      s.bedW = +m[1] * k;
      s.bedH = +m[2] * k;
    }
  }

  private isHidden(part: string) {
    return (this.getAttribute('hide') ?? '').split(/[\s,]+/).includes(part);
  }

  private $<T extends Element = HTMLElement>(sel: string) {
    return this.root.querySelector(sel) as T | null;
  }

  private render() {
    const s = this.state;
    const jointButtons = JOINTS.map(
      (j) =>
        `<button class="joint" type="button" data-joint="${j.id}" title="${j.description}" aria-pressed="${j.id === s.joint}"><svg viewBox="-4 -4 128 68" aria-hidden="true"><path d="${jointIcon(j.id)}"/></svg>${j.name}</button>`,
    ).join('');
    const bedOptions = [
      ...BEDS.map((b) => `<option value="${b.id}">${b.name}</option>`),
      `<option value="custom">Custom size</option>`,
    ].join('');
    const chips = this.sampleList
      .map(
        (x, i) =>
          `<button class="chip" type="button" data-sample="${i}" aria-pressed="${i === this.activeSample}">${x.name}</button>`,
      )
      .join('');
    this.root.innerHTML = `<style>${CSS}</style>
<div class="ls" part="layout">
  <div class="panel" part="panel">
    <section class="card" ${this.isHidden('upload') ? 'hidden' : ''}>
      <h3>Design</h3>
      <label class="drop" part="drop"><input type="file" accept=".svg,image/svg+xml" hidden><strong>Drop an SVG here</strong><span>or click to choose a file</span></label>
      <div class="chips" ${chips ? '' : 'hidden'}>${chips}</div>
      <p class="error" hidden></p>
    </section>
    <section class="card" ${this.isHidden('size') ? 'hidden' : ''}>
      <h3>Finished size</h3>
      <div class="row">
        <label class="f">Width<input type="number" name="width" min="10" step="any"></label>
        <label class="f" style="flex:0 0 84px">Units<select name="unit"><option>mm</option><option>cm</option><option>in</option></select></label>
      </div>
      <p class="hint" data-out="height"></p>
    </section>
    <section class="card" ${this.isHidden('bed') ? 'hidden' : ''}>
      <h3>Laser bed or sheet</h3>
      <label class="f">Size<select name="bed">${bedOptions}</select></label>
      <div class="row" data-custom>
        <label class="f">Width<input type="number" name="bedW" min="20" step="any"></label>
        <label class="f">Height<input type="number" name="bedH" min="20" step="any"></label>
      </div>
      <div class="row"><label class="f">Margin (mm)<input type="number" name="margin" min="0" max="100" step="0.5"></label></div>
    </section>
    <section class="card" ${this.isHidden('joint') ? 'hidden' : ''}>
      <h3>Joint</h3>
      <div class="joints">${jointButtons}</div>
      <p class="hint" data-out="joint"></p>
      <label class="f" style="margin-top:8px"><span>Width <span data-out="size"></span></span><input type="range" name="jointSize" min="8" max="120" step="1"></label>
      <label class="f" style="margin-top:8px"><span>Depth <span data-out="depth"></span></span><input type="range" name="jointDepth" min="3" max="60" step="1"></label>
    </section>
    <section class="card" ${this.isHidden('fit') ? 'hidden' : ''}>
      <details>
        <summary>Fit and extras</summary>
        <div class="row">
          <label class="f">Kerf (mm)<input type="number" name="kerf" min="0" max="2" step="0.01"></label>
          <label class="f">Clearance (mm)<input type="number" name="clearance" min="0" max="2" step="0.01"></label>
        </div>
        <div class="row"><label class="f">Backer strip width (mm, 0 for none)<input type="number" name="backers" min="0" step="1"></label></div>
        <div class="row"><label class="toggle"><input type="checkbox" name="labels"> Piece labels layer</label></div>
        <div class="row"><label class="toggle"><input type="checkbox" name="rotate"> Turn pieces to fit sheets</label></div>
      </details>
    </section>
  </div>
  <div class="main" part="main">
    <div class="bar">
      <div class="stats" data-out="stats"></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-view="assembly">Assembly</button>
        <button class="tab" role="tab" data-view="sheets">Sheets</button>
      </div>
    </div>
    <div class="stage" part="stage"><div class="empty">Drop an SVG or pick a sample. Signs, backers and wall art bigger than your laser bed are split into pieces that lock together.</div></div>
    <div class="bar">
      <span class="legend" data-out="legend"></span>
      <div class="actions" ${this.isHidden('download') ? 'hidden' : ''}>
        <button class="btn small" type="button" data-act="reset" hidden>Reset seams</button>
        <button class="btn" type="button" data-act="assembly" disabled>Assembly map</button>
        <button class="btn primary" type="button" data-act="all" disabled>Download sheets (.zip)</button>
      </div>
    </div>
    <ul class="issues" part="issues"></ul>
  </div>
</div>`;
    this.bind();
    this.syncControls();
    this.paint();
  }

  private bind() {
    const r = this.root;
    const drop = this.$('.drop')!,
      file = this.$<HTMLInputElement>('.drop input')!;
    const take = (f: File | undefined) => {
      if (!f) return;
      f.text().then((text) => {
        this.activeSample = -1;
        this.name = f.name.replace(/\.svg$/i, '').slice(0, 60) || 'design';
        this.svg = text;
        this.syncChips();
      });
    };
    file.addEventListener('change', () => take(file.files?.[0]));
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      take((e as DragEvent).dataTransfer?.files?.[0]);
    });
    r.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) =>
      b.addEventListener('click', () => this.pickSample(+b.dataset.sample!)),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-joint]').forEach((b) =>
      b.addEventListener('click', () => {
        this.state.joint = b.dataset.joint as JointType;
        this.state.jointDepth = 0;
        this.manualSeams = undefined;
        this.syncControls();
        this.schedule(true, 0);
      }),
    );
    r.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        this.view = b.dataset.view as 'assembly' | 'sheets';
        this.paint();
      }),
    );
    r.querySelector('[data-act=all]')?.addEventListener('click', () => this.download('all'));
    r.querySelector('[data-act=assembly]')?.addEventListener('click', () =>
      this.download('assembly'),
    );
    r.querySelector('[data-act=reset]')?.addEventListener('click', () => {
      this.manualSeams = undefined;
      this.schedule(true, 0);
    });
    const s = this.state;
    const field = (name: string) => r.querySelector<HTMLInputElement>(`[name=${name}]`)!;
    const onNum = (name: string, apply: (v: number) => void, resetSeams = true) =>
      field(name).addEventListener('input', () => {
        const v = Number(field(name).value);
        if (!Number.isFinite(v) || field(name).value === '') return;
        apply(v);
        if (resetSeams) this.manualSeams = undefined;
        this.syncControls(name);
        this.schedule(true);
      });
    onNum('width', (v) => v >= 10 && (s.width = v * UNIT[s.unit]));
    onNum('bedW', (v) => v >= 20 && (s.bedW = v * UNIT[s.unit]));
    onNum('bedH', (v) => v >= 20 && (s.bedH = v * UNIT[s.unit]));
    onNum('margin', (v) => (s.margin = Math.max(0, v)));
    onNum('jointSize', (v) => {
      if (!s.jointDepth) s.jointDepth = this.jointDims().depth;
      s.jointSize = v;
    });
    onNum('jointDepth', (v) => (s.jointDepth = v));
    onNum('kerf', (v) => (s.kerf = Math.max(0, v)), false);
    onNum('clearance', (v) => (s.clearance = Math.max(0, v)), false);
    onNum('backers', (v) => (s.backers = Math.max(0, v)), false);
    field('unit').addEventListener('change', () => {
      s.unit = field('unit').value as Unit;
      this.syncControls();
      this.paintStats();
    });
    field('bed').addEventListener('change', () => {
      const v = field('bed').value;
      if (v === 'custom') s.bed = 'custom';
      else this.setBed(v);
      this.manualSeams = undefined;
      this.syncControls();
      this.schedule(true, 0);
    });
    for (const name of ['labels', 'rotate'] as const)
      field(name).addEventListener('change', () => {
        s[name] = field(name).checked;
        this.schedule(true, 0);
      });
  }

  private syncChips() {
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-sample]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(+b.dataset.sample! === this.activeSample)),
      );
  }

  private pickSample(i: number) {
    const sample = this.sampleList[i];
    if (!sample) return;
    this.activeSample = i;
    const o = sample.options ?? {};
    const s = this.state;
    if (o.width) s.width = o.width;
    if (o.joint) {
      s.joint = o.joint;
      s.jointDepth = 0;
    }
    if (typeof o.bed === 'string') this.setBed(o.bed);
    if (o.backers !== undefined) s.backers = o.backers;
    this.syncControls();
    this.syncChips();
    void this.load(sample.svg, sample.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }

  private syncControls(skip?: string) {
    if (!this.root) return;
    const s = this.state,
      r = this.root;
    const set = (name: string, value: string | number) => {
      const el = r.querySelector<HTMLInputElement>(`[name=${name}]`);
      if (el && name !== skip) el.value = String(value);
    };
    const round = (mm: number) => +(mm / UNIT[s.unit]).toFixed(s.unit === 'mm' ? 1 : 2);
    set('width', round(s.width));
    set('unit', s.unit);
    set('bed', s.bed);
    set('bedW', round(s.bedW));
    set('bedH', round(s.bedH));
    set('margin', s.margin);
    set('kerf', s.kerf);
    set('clearance', s.clearance);
    set('backers', s.backers);
    const labels = r.querySelector<HTMLInputElement>('[name=labels]'),
      rotate = r.querySelector<HTMLInputElement>('[name=rotate]');
    if (labels) labels.checked = s.labels;
    if (rotate) rotate.checked = s.rotate;
    const custom = r.querySelector<HTMLElement>('[data-custom]');
    if (custom) custom.hidden = s.bed !== 'custom';
    r.querySelectorAll<HTMLButtonElement>('[data-joint]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.joint === s.joint)),
    );
    const info = JOINTS.find((j) => j.id === s.joint);
    const hint = r.querySelector('[data-out=joint]');
    if (hint && info) hint.textContent = info.description;
    const size = r.querySelector<HTMLInputElement>('[name=jointSize]'),
      depth = r.querySelector<HTMLInputElement>('[name=jointDepth]'),
      dims = this.jointDims();
    if (size && skip !== 'jointSize') size.value = String(dims.width);
    if (depth && skip !== 'jointDepth') depth.value = String(dims.depth);
    const out = r.querySelector('[data-out=size]'),
      outDepth = r.querySelector('[data-out=depth]');
    if (out) out.textContent = `(${dims.width} mm${s.jointSize ? '' : ', auto'})`;
    if (outDepth) outDepth.textContent = `(${dims.depth} mm${s.jointDepth ? '' : ', auto'})`;
    if (size) size.disabled = info?.kind === 'none';
    if (depth) depth.disabled = info?.kind === 'none';
  }

  /** The joint width and depth the next split will use, in whole mm. */
  private jointDims() {
    const s = this.state,
      info = JOINTS.find((j) => j.id === s.joint);
    const width =
      s.jointSize ||
      Math.round(Math.min(70, Math.max(12, (Math.min(s.bedW, s.bedH) - 2 * s.margin) * 0.14)));
    return { width, depth: Math.round(s.jointDepth || width * (info?.aspect ?? 0)) };
  }

  private schedule(resplit: boolean, delay = 160) {
    if (!resplit || !this.source || !this.ready) return;
    this.$('.stage')?.classList.add('busy');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.split(), delay);
  }

  private showError(error: unknown) {
    const el = this.$('.error');
    if (!el) return;
    el.hidden = !error;
    el.textContent = error ? (error instanceof Error ? error.message : String(error)) : '';
  }

  private paintStats() {
    const r = this.current,
      s = this.state,
      out = this.$('[data-out=stats]'),
      height = this.$('[data-out=height]');
    if (height)
      height.textContent = r
        ? `Height ${fmt(r.height, s.unit)} at this width.`
        : 'Height follows the design.';
    if (!out) return;
    if (!r) {
      out.innerHTML = '';
      return;
    }
    const pieces = r.parts.filter((p) => p.kind === 'piece').length,
      keys = r.parts.filter((p) => p.kind === 'key').length,
      backers = r.parts.filter((p) => p.kind === 'backer').length;
    const stat = (n: number | string, label: string) =>
      `<span class="stat"><b>${n}</b> ${label}</span>`;
    out.innerHTML = [
      stat(pieces, pieces === 1 ? 'piece' : 'pieces'),
      stat(r.sheets.length, r.sheets.length === 1 ? 'sheet' : 'sheets'),
      keys ? stat(keys, 'keys') : '',
      backers ? stat(backers, 'backers') : '',
      stat(`${fmt(r.width, s.unit)} × ${fmt(r.height, s.unit)}`, ''),
    ].join('');
  }

  private paint() {
    if (!this.root) return;
    const r = this.current;
    this.paintStats();
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-view]')
      .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === this.view)));
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-act=all],[data-act=assembly]')
      .forEach((b) => {
        b.disabled = !r;
      });
    const reset = this.$('[data-act=reset]');
    if (reset) reset.hidden = !this.manualSeams;
    const legend = this.$('[data-out=legend]');
    if (legend)
      legend.textContent = r
        ? this.view === 'assembly'
          ? r.seams.x.length + r.seams.y.length
            ? 'Drag a seam to move it.'
            : 'The design already fits the bed.'
          : 'Red cuts, blue labels, artwork in its own colours.'
        : '';
    this.paintIssues(r?.issues ?? []);
    const stage = this.$('.stage');
    if (!stage || !r) return;
    if (this.view === 'sheets') {
      stage.innerHTML = `<div class="sheets">${r.sheets
        .map(
          (sh) =>
            `<div class="sheet"><div class="bed">${sh.svg}</div><div class="meta"><span><b>Sheet ${sh.index + 1}</b> · ${sh.parts.join(', ')} · ${Math.round(sh.usage * 100)}%</span><button class="btn small" type="button" data-sheet="${sh.index}">SVG</button></div></div>`,
        )
        .join('')}</div>`;
      stage
        .querySelectorAll<HTMLButtonElement>('[data-sheet]')
        .forEach((b) => b.addEventListener('click', () => this.download(+b.dataset.sheet!)));
      return;
    }
    stage.innerHTML = assemblySvg(r, { gap: assemblyGap(r), labels: this.state.labels });
    const svg = stage.querySelector('svg')!;
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    this.addSeamHandles(svg, r);
    this.addMarkers(svg, r);
  }

  private paintIssues(issues: Issue[]) {
    const list = this.$('.issues');
    if (!list) return;
    const shown = issues.filter((i) => i.code !== 'OPEN_PATH_KEPT');
    list.innerHTML = shown
      .slice(0, 8)
      .map(
        (i) =>
          `<li class="${i.code === 'PART_TOO_LARGE' || i.code === 'SMALL_FRAGMENT' ? 'bad' : ''}">${i.message.replace(/</g, '&lt;')}</li>`,
      )
      .join('');
  }

  private addMarkers(svg: SVGSVGElement, r: SplitResult) {
    const gap = assemblyGap(r),
      size = Math.max(r.width, r.height) / 70;
    for (const issue of r.issues) {
      if (!issue.at) continue;
      const [dx, dy] = explodeOffset(r, issue.at, gap);
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('class', 'marker');
      c.setAttribute('cx', String(issue.at[0] + dx));
      c.setAttribute('cy', String(issue.at[1] + dy));
      c.setAttribute('r', String(size));
      svg.appendChild(c);
    }
  }

  /** Replace the drawn parts in place, keeping the seam handles that are being dragged. */
  private swapParts(svg: SVGSVGElement, r: SplitResult) {
    const doc = new DOMParser().parseFromString(
      assemblySvg(r, { gap: assemblyGap(r), labels: this.state.labels }),
      'image/svg+xml',
    );
    svg.querySelectorAll('g[data-part], .marker').forEach((n) => n.remove());
    const anchor = svg.querySelector('.seam');
    for (const g of doc.querySelectorAll('g[data-part]'))
      svg.insertBefore(document.importNode(g, true), anchor);
    this.addMarkers(svg, r);
  }

  private addSeamHandles(svg: SVGSVGElement, r: SplitResult) {
    const gap = assemblyGap(r),
      W = r.width + r.seams.x.length * gap,
      H = r.height + r.seams.y.length * gap,
      grip = Math.max(W, H) / 60;
    const toLocal = (e: PointerEvent): Point => {
      const m = svg.getScreenCTM();
      if (!m) return [0, 0];
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return [p.x, p.y];
    };
    const make = (axis: 'x' | 'y', k: number) => {
      const seams = axis === 'x' ? r.seams.x : r.seams.y,
        limits = axis === 'x' ? r.seamLimits.x[k] : r.seamLimits.y[k],
        shift = (k + 0.5) * gap;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', `seam ${axis}`);
      const lines = ['show', 'hit'].map((cls) => {
        const l = document.createElementNS(SVG_NS, 'line');
        l.setAttribute('class', cls);
        l.setAttribute('stroke-width', String(cls === 'hit' ? grip * 1.2 : Math.max(W, H) / 500));
        g.appendChild(l);
        return l;
      });
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', String(grip * 0.55));
      dot.setAttribute('stroke-width', String(grip * 0.12));
      g.appendChild(dot);
      const place = (v: number) => {
        const d = v + shift;
        for (const l of lines) {
          if (axis === 'x') {
            l.setAttribute('x1', String(d));
            l.setAttribute('x2', String(d));
            l.setAttribute('y1', String(-grip));
            l.setAttribute('y2', String(H + grip));
          } else {
            l.setAttribute('y1', String(d));
            l.setAttribute('y2', String(d));
            l.setAttribute('x1', String(-grip));
            l.setAttribute('x2', String(W + grip));
          }
        }
        dot.setAttribute('cx', String(axis === 'x' ? d : -grip * 0.2));
        dot.setAttribute('cy', String(axis === 'x' ? -grip * 0.2 : d));
      };
      let value = seams[k];
      place(value);
      const hit = lines[1];
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        hit.setPointerCapture(e.pointerId);
        g.classList.add('drag');
        let frame = 0,
          last = 0;
        const seamsAt = (v: number) => {
          const next = { x: [...r.seams.x], y: [...r.seams.y] };
          next[axis][k] = v;
          return next;
        };
        const live = () => {
          frame = 0;
          last = performance.now();
          this.manualSeams = seamsAt(value);
          try {
            this.current = splitSvg(this.source, this.options);
            this.swapParts(svg, this.current);
            this.paintStats();
          } catch {
            return;
          }
        };
        const move = (ev: PointerEvent) => {
          const [x, y] = toLocal(ev);
          value = Math.min(limits[1], Math.max(limits[0], (axis === 'x' ? x : y) - shift));
          place(value);
          if (!frame && performance.now() - last > 40) frame = requestAnimationFrame(live);
        };
        const up = () => {
          hit.removeEventListener('pointermove', move);
          hit.removeEventListener('pointerup', up);
          hit.removeEventListener('pointercancel', up);
          if (frame) cancelAnimationFrame(frame);
          g.classList.remove('drag');
          if (Math.abs(value - seams[k]) < 0.5 && !this.manualSeams) return;
          this.manualSeams = seamsAt(value);
          this.schedule(true, 0);
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerup', up);
        hit.addEventListener('pointercancel', up);
      });
      svg.appendChild(g);
    };
    r.seams.x.forEach((_, k) => make('x', k));
    r.seams.y.forEach((_, k) => make('y', k));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('laser-split'))
  customElements.define('laser-split', LaserSplitElement);

declare global {
  interface HTMLElementTagNameMap {
    'laser-split': LaserSplitElement;
  }
}
