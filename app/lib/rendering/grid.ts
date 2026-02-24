import createREGL from 'regl';

const vert = `
precision highp float;
attribute vec2 position;
attribute float yScreen;

uniform float u_resolution_y;

void main() {
  float thickness = 0.25; 

  // yScreen is the top edge of the line in screen pixels relative to canvas top
  // TODO(ziad): The 4.0 just makes it align with the accordion menu items, idk how to do this automatically.
  float finalY = yScreen + (position.y - 4.0) * thickness;
  
  // Convert to NDC. Screen Y=0 -> NDC=1, Screen Y=H -> NDC=-1
  float ndcY = 1.0 - (finalY / u_resolution_y) * 2.0;
  
  // X is 0..1 -> -1..1
  float ndcX = position.x * 2.0 - 1.0;
  
  gl_Position = vec4(ndcX, ndcY, 0, 1);
}
`

const frag = `
precision highp float;
void main() {
  // TODO(ziad): Match color the scheme.
  gl_FragColor = vec4(0.3, 0.3, 0.3, 1.0);
}
`

export class GridRenderer {
  private draw: createREGL.DrawCommand;
  private buffer: createREGL.Buffer;

  constructor(private readonly regl: createREGL.Regl, private readonly canvas: HTMLCanvasElement | null) {
    this.buffer = regl.buffer({ length: 0, type: 'float', usage: 'dynamic' });

    this.draw = regl({
      vert,
      frag,
      attributes: {
        position: [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]],
        yScreen: {
          buffer: this.buffer,
          divisor: 1
        }
      },
      uniforms: {
        u_resolution_y: (ctx: any) => ctx.viewportHeight
      },
      instances: (ctx: any, props: any) => props.count,
      count: 6
    });
  }

  update() {
    if (!this.canvas) return;
    const uiStore = useUIStore();

    const canvasRect = this.canvas.getBoundingClientRect();
    const rows = uiStore.rowLayout;

    const lines = new Float32Array(rows.length * 2);
    let count = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row) {
          lines[count++] = row.top + row.height - canvasRect.top;
        }
    }
          
    this.buffer(lines.subarray(0, count));
    this.draw({ count });
  }
}