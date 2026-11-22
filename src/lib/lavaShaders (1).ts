// The lava lamp's shaders (spec feat-lava-lamp LL3), GLSL ES 3.00 for WebGL2. The flow follows Jos Stam's "stable
// fluids": velocity in cells per second on a 160 x 90 grid; the wax is colour (rgb, premultiplied by its amount)
// with heat in alpha, on a finer grid carried by the flow. A spray is a gaussian carrying strength, width, push and
// a kind: gusts and whips push along their direction, puffs bloom outward from a point, and every spray paints a
// core colour with a partner hue at its rim, so neighbouring colours melt through each other.

export const VERTEX = '#version 300 es\nin vec2 a;out vec2 vUv;void main(){vUv=a*0.5+0.5;gl_Position=vec4(a,0.0,1.0);}';

export const PASS_HEAD = '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 o;\nuniform vec2 tx;\n';

// The four neighbours of a cell: L, R from component c[0], T, B from c[1].
const nb = (s: string, c: string) =>
  `float L=texture(${s},vUv-vec2(tx.x,0.0)).${c[0]},R=texture(${s},vUv+vec2(tx.x,0.0)).${c[0]},T=texture(${s},vUv+vec2(0.0,tx.y)).${c[1]},B=texture(${s},vUv-vec2(0.0,tx.y)).${c[1]};`;
const pal = 'vec3 pal(int k){return k==0?vec3(1.0,0.478,0.239):(k==1?vec3(0.941,0.31,0.627):(k==2?vec3(0.4,0.851,0.651):vec3(0.663,0.549,0.941)));}\n';
const cap = 'float m=max(c.r,max(c.g,c.b));if(m>0.9)c.rgb*=0.9/m;c.a=clamp(c.a,0.0,1.4);';
const jet = 'vec2 q=vUv-jp[i].xy;q.x*=asp;float e=exp(-dot(q,q)/jq[i].y)*jq[i].x;';

export const PASSES = {
  // the first wax in the lamp: eight blobs of the base colours, some warm
  seed: `uniform float asp;${pal}float h(float n){return fract(sin(n*12.9898)*43758.5453);}
void main(){vec4 c=vec4(0.0);for(int i=0;i<8;i++){float fi=float(i);vec2 q=vUv-vec2(0.08+0.84*h(fi+1.0),0.1+0.8*h(fi+7.3));q.x*=asp;float g=exp(-dot(q,q)/0.006);c.rgb+=pal(i%4)*g;c.a+=g*h(fi+3.1)*1.1;}${cap}o=c;}`,
  curl: `uniform sampler2D v;void main(){${nb('v', 'yx')}o=vec4(0.5*(R-L-T+B),0.0,0.0,1.0);}`,
  vort: `uniform sampler2D v;uniform sampler2D c;uniform float k;uniform float dt;
void main(){${nb('c', 'xx')}float C=texture(c,vUv).x;vec2 f=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+0.0001;f*=k*C;f.y*=-1.0;
vec2 w=texture(v,vUv).xy+f*dt;o=vec4(clamp(w,-200.0,200.0),0.0,1.0);}`,
  // warm wax rises, cooled wax is heavier than the water and sinks (at the lava's pace); a spray pushes inward along
  // its direction, or outward in every direction when it is a puff (jq[i].w is 1 then)
  force: `uniform sampler2D v;uniform sampler2D d;uniform float dt;uniform float rate;uniform float asp;uniform float boost;uniform vec4 hp[3];uniform vec4 jp[8];uniform vec4 jq[8];
void main(){vec2 w=texture(v,vUv).xy;vec4 c=texture(d,vUv);float dens=min(max(c.r,max(c.g,c.b)),1.2);
w.y+=(17.0*c.a-7.5*dens)*boost*dt*rate;
for(int i=0;i<3;i++){vec2 q=vUv-hp[i].xy;q.x*=asp;w.y+=exp(-dot(q,q)/hp[i].z)*hp[i].w*20.0*dt*rate;}
for(int i=0;i<8;i++){${jet}vec2 p=jp[i].zw*e*jq[i].z;w+=mix(p,normalize(q+vec2(1e-5,1e-5))*e*jq[i].z,jq[i].w)*dt;}
w*=exp(-dt*1.9);o=vec4(clamp(w,-200.0,200.0),0.0,1.0);}`,
  // the wax: heaters and sprays add warm wax of their colour; the bottom rewarms what sinks; it cools as it rises;
  // it fades by the fade uniform (very slowly, faster once the lamp holds more than its budget). Each spray paints
  // its rim colour at the edge of its gaussian and its core colour in the middle, so one spray alone is a gradient
  // and two overlapping sprays walk from hue to hue instead of stacking.
  src: `uniform sampler2D d;uniform float dt;uniform float rate;uniform float fade;uniform float asp;uniform vec4 hp[3];uniform vec3 hc[3];uniform vec4 jp[8];uniform vec4 jq[8];uniform vec3 jc[8];uniform vec3 jc2[8];
void main(){vec4 c=texture(d,vUv);float sd=dt*rate;
for(int i=0;i<3;i++){vec2 q=vUv-hp[i].xy;q.x*=asp;float e=exp(-dot(q,q)/hp[i].z)*hp[i].w*sd;c.rgb+=hc[i]*e;c.a+=e*1.3;}
for(int i=0;i<8;i++){vec2 q=vUv-jp[i].xy;q.x*=asp;float f=exp(-dot(q,q)/jq[i].y);float e=f*jq[i].x*dt*2.2;c.rgb+=mix(jc2[i],jc[i],smoothstep(0.05,0.55,f))*e;c.a+=e*0.9;}
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

// What the screen shows (LL3-5, calm pass): the purple glow drifts slowly and breathes with the sound, and the wax
// is one soft, blurred glow — no sticker outline, no hard shadow, no shimmering dither. A backdrop, not a show.
export const SHOW = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
uniform vec2 uSize;     // the canvas, drawn pixels
uniform float uT;       // seconds, for the slow drift of the glow
uniform float uGlow;    // the smoothed bass, mid and treble: the whole backdrop breathes with it
uniform sampler2D uDye; // the wax: colour (rgb) and heat (a)

const vec3 BG_IN = vec3(0.29, 0.165, 0.541);
const vec3 BG_OUT = vec3(0.063, 0.031, 0.137);

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float densOf(vec4 d) { return max(d.r, max(d.g, d.b)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 q = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  // the glow's centre wanders a long, slow loop: the whole screen moves, gently
  vec2 drift = 0.12 * vec2(sin(uT * 0.13) + 0.4 * sin(uT * 0.041), cos(uT * 0.09) + 0.4 * sin(uT * 0.053));
  vec3 col = mix(BG_IN * 0.85, BG_OUT, smoothstep(0.0, 1.3, length(q - drift)));
  col *= 0.84 + 0.08 * uGlow; // the backdrop barely brightens with the sound: no white wash
  // the wax, softened: five samples two and a half wax texels apart smear the hues into each other
  vec2 s = vec2(0.00977, 0.01736); // two and a half wax texels
  vec4 d = 0.4 * texture(uDye, uv)
         + 0.15 * (texture(uDye, uv + vec2(s.x, 0.0)) + texture(uDye, uv - vec2(s.x, 0.0))
                 + texture(uDye, uv + vec2(0.0, s.y)) + texture(uDye, uv - vec2(0.0, s.y)));
  float f = densOf(d);
  vec3 c = clamp(d.rgb / max(f, 0.001), 0.0, 1.0); // where colours meet they blend
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(lum), c, 1.05), 0.0, 0.68); // no bright or white highlights: overlapping inks stay mid-tone
  c = mix(c, BG_IN * 0.7, 0.35); // low key: the picture stays the star
  float heat = clamp(d.a, 0.0, 1.0);
  // one wide ramp: the wax is a soft glow, warm where it is hot — no outline, no shadow
  col = mix(col, c * (0.7 + 0.16 * heat), smoothstep(0.0, 0.6, f));
  // the wax catches a little of the sound, never a white halo
  col += c * 0.04 * uGlow * smoothstep(0.0, 0.35, f);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // a fixed speck of dither, so the gradient never bands
  o = vec4(col, 1.0);
}
`;
