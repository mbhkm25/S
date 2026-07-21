import { useEffect, useRef } from 'react';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import './LightRays.css';

export default function LightRays() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0; let visible = true;
    const renderer = new Renderer({ alpha: true, dpr: Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.8) });
    const gl = renderer.gl; element.appendChild(gl.canvas);
    const vertex = `attribute vec2 position;varying vec2 vUv;void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
    const fragment = `precision highp float;uniform float t;uniform vec2 r;varying vec2 vUv;
      float ray(vec2 p,float seed){vec2 s=vec2(.5,-.18);vec2 d=p-s;float a=max(dot(normalize(d),vec2(0.,1.)),0.);float bands=.62+.25*sin(a*42.+t*(.22+seed));float fade=smoothstep(1.25,.08,length(d));return pow(a,5.)*bands*fade;}
      void main(){vec2 p=vUv;p.x=(p.x-.5)*(r.x/r.y)+.5;float q=ray(p,0.)*.52+ray(p+.035,1.)*.34;vec3 c=mix(vec3(.02,.18,.22),vec3(.15,.92,.68),vUv.y);gl_FragColor=vec4(c*q,q*.68);}`;
    const uniforms = { t:{ value:0 }, r:{ value:[1,1] } };
    const mesh = new Mesh(gl, { geometry:new Triangle(gl), program:new Program(gl,{vertex,fragment,uniforms,transparent:true}) });
    const resize = () => { const {clientWidth:w,clientHeight:h}=element; renderer.setSize(w,h); uniforms.r.value=[w,h]; };
    const observer = new IntersectionObserver(([entry]) => { visible=entry.isIntersecting; }); observer.observe(element);
    const loop = (time:number) => { if(visible){uniforms.t.value=time*.001;renderer.render({scene:mesh});} frame=requestAnimationFrame(loop); };
    resize(); addEventListener('resize',resize); frame=requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); removeEventListener('resize',resize); observer.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); gl.canvas.remove(); };
  }, []);
  return <div ref={host} className="light-rays" aria-hidden="true" />;
}
