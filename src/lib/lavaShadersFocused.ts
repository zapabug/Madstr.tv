// The lava lamp's shaders (spec feat-lava-lamp LL3), GLSL ES 3.00 for WebGL2. The flow follows Jos Stam's "stable
// fluids": velocity in cells per second on a 160 x 90 grid; the wax is colour (rgb, premultiplied by its amount)
// with heat in alpha, on a finer grid carried by the flow.

export const VERTEX = '#version 300 es\nin vec2 a;out vec2 vUv;void main(){vUv=a*0.5+0.5;gl_Position=vec4(a,0.0,1.0);}';

export const PASS_HEAD = '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 o;\nuniform vec2 tx;\n';

// The four neighbours of a cell: L, R from component c[0], T, B from c[1].
const nb = (s: string, c: string) =>
  `float L=texture(${s},vUv-vec2(tx.x,0.0)).${c[0]},R=texture(${s},vUv+vec2(tx.x,0.0)).${c[0]},T=texture(${s},vUv+vec2(0.0,tx.y)).${c[1]},B=texture(${s},vUv-vec2(0.0,tx.y)).${c[1]};`;
const pal = 'vec3 pal(int k){return k==0?vec3(1.0,0.478,0.239):(k==1?vec3(0.941,0.31,0.627):(k==2?vec3(0.4,0.851,0.651):vec3(0.663,0.549,0.941)));}\n';
const cap = 'float m=max(c.r,max(c.g,c.b));if(m>1.2)c.rgb*=1.2/m;c.a=clamp(c.a,0.0,1.4);';
const jet = 'vec2 q=vUv-jp[i].xy;q.x*=asp;float e=exp(-dot(q,q)/jq[i].y)*jq[i].x;';

export const PASSES = {
  // the first wax in the lamp: eight blobs of the base colours, some warm
  seed: `uniform float asp;${pal}float h(float n){return fract(sin(n*12.9898)*43758.5453);}
void main(){vec4 c=vec4(0.0);for(int i=0;i<8;i++){float fi=float(i);vec2 q=vUv-vec2(0.08+0.84*h(fi+1.0),0.1+0.8*h(fi+7.3));q.x*=asp;float g=exp(-dot(q,q)/0.006);c.rgb+=pal(i%4)*g;c.a+=g*h(fi+3.1)*1.1;}${cap}o=c;}`,
  curl: `uniform sampler2D v;void main(){${nb('v', 'yx')}o=vec4(0.5*(R-L-T+B),0.0,0.0,1.0);}`,
  vort: `uniform sampler2D v;uniform sampler2D c;uniform float k;uniform float dt;
void main(){${nb('c', 'xx')}float C=texture(c,vUv).x;vec2 f=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+0.0001;f*=k*C;f.y*=-1.0;
vec2 w=texture(v,vUv).xy+f*dt;o=vec4(clamp(w,-300.0,300.0),0.0,1.0);}`,
  // warm wax rises, cooled wax is heavier than the water and sinks (at the lava's pace); a spray pushes inward
  force: `uniform sampler2D v;uniform sampler2D d;uniform float dt;uniform float rate;uniform float asp;uniform vec4 hp[3];uniform vec4 jp[4];uniform vec4 jq[4];
void main(){vec2 w=texture(v,vUv).xy;vec4 c=texture(d,vUv);float dens=min(max(c.r,max(c.g,c.b)),1.2);
w.y+=(26.0*c.a-11.0*dens)*dt*rate;
for(int i=0;i<3;i++){vec2 q=vUv-hp[i].xy;q.x*=asp;w.y+=exp(-dot(q,q)/hp[i].z)*hp[i].w*30.0*dt*rate;}
for(int i=0;i<4;i++){${jet}w+=jp[i].zw*e*240.0*dt;}
w*=exp(-dt*1.2);o=vec4(clamp(w,-300.0,300.0),0.0,1.0);}`,
  // the wax: heaters and sprays add warm wax of their colour; the bottom rewarms what sinks; it cools as it rises;
  // it fades by the fade uniform (very slowly, faster once the lamp holds more than its budget)
  src: `uniform sampler2D d;uniform float dt;uniform float rate;uniform float fade;uniform float asp;uniform vec4 hp[3];uniform vec3 hc[3];uniform vec4 jp[4];uniform vec4 jq[4];uniform vec3 jc[4];
void main(){vec4 c=texture(d,vUv);float sd=dt*rate;
for(int i=0;i<3;i++){vec2 q=vUv-hp[i].xy;q.x*=asp;float e=exp(-dot(q,q)/hp[i].z)*hp[i].w*sd;c.rgb+=hc[i]*e;c.a+=e*1.3;}
for(int i=0;i<4;i++){${jet}e*=dt*4.0;c.rgb+=jc[i]*e;c.a+=e*0.9;}
float dens=max(c.r,max(c.g,c.b));
c.a+=sd*0.6*(1.0-smoothstep(0.0,0.1,vUv.y))*min(dens,1.0);
c.a*=exp(-sd*(0.1+0.9*smoothstep(0.75,1.0,vUv.y)));
c.rgb*=exp(-dt*fade);
${cap}o=c;}`,
  div: `uniform sampler2D v;void main(){vec2 C=texture(v,vUv).xy;${nb('v', 'xy')}
if(vUv.x-tx.x<0.0)L=-C.x;if(vUv.x+tx.x>1.0)R=-C.x;if(vUv.y+tx.y>1.0)T=-C.y;if(vUv.y-tx.y<0.0)B=-C.y;
o=vec4(0.5*(R-L+T-B),0.0,0.0,1.0);}`,
  fade: `uniform sampler2D p;uniform float s;void main(){o=vec4(texture(p,vUv).x*s,0.0,0.0,1.0);}`,
  jac: `uniform sampler2D p;uniform sampler2D dv;void main(){${nb('p', 'xx')}o=vec4((L+R+T+B-texture(dv,vUv).x)*0.25,0.0,0.0,1.0);}`,
  grad: `uniform sampler2D p;uniform sampler2D v;void main(){${nb('p', 'xx')}o=vec4(texture(v,vUv).xy-vec2(R-L,T-B),0.0,1.0);}`,
  adv: `uniform sampler2D v;uniform sampler2D s;uniform float dt;uniform float wall;
void main(){vec4 r=texture(s,vUv-dt*texture(v,vUv).xy*tx);
if(wall>0.5){vec2 m=step(tx,vUv)*step(vUv,1.0-tx);r.xy*=m.x*m.y;}o=r;}`,
} as const;

// What the screen shows (LL3-5): the purple glow, thin wax glowing softly, thick wax as Jukestr 3000 stickers.
export const SHOW = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform vec2 uSize;     // the canvas, drawn pixels
uniform float uT;       // seconds, for the dither
uniform sampler2D uDye; // the wax: colour (rgb) and heat (a)

const vec3 INK = vec3(0.078);
const vec3 BG_IN = vec3(0.29, 0.165, 0.541);
const vec3 BG_OUT = vec3(0.063, 0.031, 0.137);

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float densOf(vec4 d) { return max(d.r, max(d.g, d.b)); }
float waxAt(vec2 uv) { return densOf(texture(uDye, uv)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 q = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  vec3 col = mix(BG_IN * 0.8, BG_OUT, smoothstep(0.0, 0.95, length(q)));
  vec4 d = texture(uDye, uv);
  float f = densOf(d);
  vec3 c = clamp(d.rgb / max(f, 0.001), 0.0, 1.0); // where colours meet they blend
  c = mix(c, BG_IN * 0.7, 0.22); // low key: the picture stays the star
  float heat = clamp(d.a, 0.0, 1.0);
  // thin wax, a spray's trail: a soft glow
  col = mix(col, c * (0.75 + 0.4 * heat), smoothstep(0.03, 0.38, f) * 0.6);
  // thick wax: a sticker with a black outline, a hard shadow down-right, lighter where warm, a light band top-left
  float th = 0.38;
  float w = max(fwidth(f), 0.0001);
  col = mix(col, col * 0.45, smoothstep(th - w, th + w, waxAt(uv + vec2(-0.00625, 0.0139))));
  float lit = waxAt(uv + vec2(0.007, -0.0153)) - f;
  vec3 fill = mix(c, mix(c, vec3(1.0), 0.28), smoothstep(0.45, 0.55, heat));
  fill = mix(fill, mix(fill, vec3(1.0), 0.45), smoothstep(0.1, 0.14, lit) * smoothstep(th, th + 0.3, f));
  col = mix(col, INK, smoothstep(th - 3.0 * w, th - 2.2 * w, f));
  col = mix(col, fill, smoothstep(th - 0.5 * w, th + 0.5 * w, f));
  col += (hash(gl_FragCoord.xy + fract(uT)) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;
