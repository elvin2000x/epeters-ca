// Shared GLSL for the microscope: organism drawings (LIB) and the full-field pass (MAIN).
// World units are micrometres. OD = optical density (brightfield), SC = scatter (darkfield).
export const LIB = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uC; uniform float uR, uDpr, uPx; uniform vec2 uCam;
uniform float uFocus, uTan, uDof, uT, uBeat;
uniform int uMode;
vec3 OD; vec3 SC; float HALO; float ZOFF; float LIGHT;
float h11(float n){ return fract(sin(n*12.9898)*43758.5453); }
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n=h21(p); return vec2(n,h21(p+n*17.13+3.7)); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y); }
float blurAt(float z){ return max(abs(uFocus-ZOFF-z)-uDof*0.5,0.)*uTan+0.7/uPx; }
float fillD(float d,float b){ return 1.-smoothstep(-b,b,d); }
float ringD(float d,float w,float b){ float s=max(w,b); return exp(-d*d/(s*s))*min(1.,1.5*w/s); }
float detail(float sz,float b){ return smoothstep(0.6,2.2,sz*uPx)/(1.+(b/sz)*(b/sz)); }
float becke(float z){ return clamp((uFocus-ZOFF-z)/(uDof+1.5),-1.,1.); }
float gran(vec2 q,float cell,float sd){ vec2 c=floor(q/cell); vec2 h=h22(c+sd); vec2 ctr=(c+0.25+0.5*h)*cell; return length(q-ctr)-cell*(0.10+0.14*h21(c+4.2+sd)); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }

void debris(vec2 p, float dens){
  float G=70.; vec2 base=floor(p/G-0.5);
  for(int j=0;j<4;j++){
    vec2 c=base+vec2(mod(float(j),2.),floor(float(j)*0.5));
    vec2 h=h22(c); if(h.x>dens) continue;
    vec2 ctr=(c+0.2+0.6*h22(c+3.1))*G+1.2*vec2(sin(uT*0.7+h.x*40.),cos(uT*0.6+h.y*40.));
    float r=0.7+7.*h.y*h.y*h.y;
    float z=(h21(c+7.7)-0.5)*140.;
    vec2 q=p-ctr; float a=atan(q.y,q.x);
    float d=length(q)-r*(1.+0.25*sin(3.*a+h.x*20.)+0.12*sin(5.*a+h.y*9.));
    float b=blurAt(z); float e=(r*r)/(r*r+b*b);
    OD+=(fillD(d,b)*vec3(0.30,0.33,0.40)*(0.35+h.y)+ringD(d,0.5,b)*0.25)*e;
    SC+=(ringD(d,0.5,b)*1.3+fillD(d,b)*0.12)*e;
  }
}

void para(vec2 p, vec4 A, vec4 B){
  float L=B.x, Wd=B.y, hl=L*0.5;
  vec2 q=p-A.xy; vec2 ax=vec2(cos(A.z),sin(A.z));
  float u=dot(q,ax), v=dot(q,vec2(-ax.y,ax.x));
  float b0=blurAt(0.);
  float pad=16.+3.*b0;
  if(abs(u)>hl+pad||abs(v)>Wd*0.5+pad) return;
  float phi=A.w, cp=cos(phi);
  float s=clamp(u/hl,-1.5,1.5);
  float rr=Wd*0.5*(1.+0.16*s-0.10*s*s);
  float side=step(0.,v*cp);
  rr*=1.-side*0.14*abs(cp)*exp(-pow((s-0.25)/0.33,2.));
  float pn=mix(1.85,2.3,smoothstep(-0.4,0.4,s));
  float vn=v/rr;
  float f=pow(pow(abs(s),pn)+pow(abs(vn),pn),1./pn);
  float g=length(vec2(s/hl,vn/rr))/max(length(vec2(s,vn)),1e-3);
  float d=(f-1.)/max(g,1e-4);
  float m=fillD(d,b0);
  float rloc=rr*pow(max(1.-pow(min(abs(s),1.),pn),0.),1./pn)+1e-3;
  float w=clamp(v/rloc,-1.,1.);
  float ztop=rloc*sqrt(1.-w*w);
  // cytoplasm and cortex
  OD+=m*vec3(0.10,0.07,0.14);
  float rim=ringD(d+0.8,0.9,b0);
  OD+=rim*vec3(0.55,0.50,0.45); SC+=rim*vec3(0.9);
  HALO+=ringD(d-1.6,1.2,b0)*becke(0.);
  if(d<0.5){
    // streaming granules (cyclosis)
    float flow=uT*9.*sign(v);
    float gd=detail(1.4,b0)*smoothstep(-2.,-6.,d);
    float gm=fillD(gran(vec2(u+flow,v),2.2,B.z),max(b0,0.35/uPx))*gd;
    float gm2=fillD(gran(vec2(u-flow*0.6,v)+1.1,3.1,B.z+2.),max(blurAt(8.),0.35/uPx))*detail(1.4,blurAt(8.))*smoothstep(-2.,-6.,d);
    OD+=m*(vec3(0.06,0.05,0.06)+gm*vec3(0.22,0.20,0.16)+gm2*vec3(0.12,0.11,0.09));
    SC+=m*(vec3(0.02)+gm*0.55+gm2*0.3);
    // kinety rows on the top and bottom surfaces, visible only when focused there
    for(int sd=0;sd<2;sd++){
      float sg=sd==0?1.:-1.;
      float psi=sg*acos(w)-phi;
      float pat=smoothstep(0.55,1.,0.5+0.5*cos(60.*psi+s*3.))*(0.6+0.4*cos(u*6.2831/1.7));
      float vis=exp(-pow(blurAt(sg*ztop)/0.7,2.))*smoothstep(3.,7.,3.1*uPx)*m;
      OD+=pat*vis*0.20; SC+=pat*vis*0.35;
    }
    // macronucleus
    float th=1.2+phi; vec2 nc=vec2(0.02*hl, 0.25*Wd*0.5*cos(th)); float nz=0.25*Wd*0.5*sin(th);
    float dn=(length((vec2(u,v)-nc)/vec2(24.,12.))-1.)*12.;
    float bn=blurAt(nz);
    OD+=m*(fillD(dn,bn)*(vec3(0.09,0.10,0.08)+0.08*(vnoise(vec2(u,v)/1.2)-0.5)*detail(1.2,bn))+ringD(dn,1.,bn)*0.22);
    SC+=m*ringD(dn,1.,bn)*0.45;
    float dmi=length(vec2(u,v)-nc-vec2(15.,-9.*cos(th)))-3.5;
    OD+=m*fillD(dmi,bn)*0.22; SC+=m*ringD(dmi,0.6,bn)*0.5;
    // contractile vacuoles: dorsal side, front and back thirds
    for(int k=0;k<2;k++){
      float cs=k==0?0.5:-0.5;
      float rl=Wd*0.5*0.85*0.6;
      vec2 cc=vec2(cs*hl, rl*cos(3.1416+phi)); float cz=rl*sin(3.1416+phi);
      float cyc=fract(uT/6.+float(k)*0.5);
      float rad=cyc<0.85?mix(1.5,7.,cyc/0.85):mix(7.,1.,(cyc-0.85)/0.15);
      float cf=cyc<0.85?1.-cyc/0.85:(cyc-0.85)/0.15;
      vec2 pc=vec2(u,v)-cc; float rd=length(pc);
      float bz=blurAt(cz);
      float dv=rd-rad;
      OD-=m*fillD(dv,bz)*0.10; OD+=m*ringD(dv,0.6,bz)*0.30; SC+=m*ringD(dv,0.6,bz)*0.7;
      float ang=atan(pc.y,pc.x)*7./6.2831;
      float da=(fract(ang+0.5)-0.5)*6.2831/7.*rd;
      float tt=(rd-rad)/16.;
      if(tt>0.&&tt<1.){ float wdt=0.3+cf*1.6*sin(3.1416*tt); float can=fillD(abs(da)-wdt,bz)*detail(1.,bz); OD-=m*can*0.06; OD+=m*ringD(abs(da)-wdt,0.4,bz)*0.10*cf; SC+=m*can*0.3*cf; }
    }
    // food vacuoles circulating
    for(int k=0;k<6;k++){
      float fk=float(k);
      if(fk>=B.w) break;
      float fs=0.5*cos(uT*0.15+fk*1.05);
      float fth=fk*2.1+uT*0.12+phi;
      float rl=0.45*Wd*0.5*sqrt(max(1.-fs*fs,0.));
      vec2 fc=vec2(fs*hl, rl*cos(fth)); float fz=rl*sin(fth);
      float df=length(vec2(u,v)-fc)-(3.+2.5*h11(fk+B.z));
      float bf=blurAt(fz);
      OD+=m*(fillD(df,bf)*vec3(0.16,0.26,0.44)+ringD(df,0.5,bf)*0.15);
      SC+=m*ringD(df,0.5,bf)*vec3(1.,0.8,0.5)*0.6;
    }
    // oral groove: ventral, from mid-body to the front, twisting to the left
    if(s>0.02&&s<0.9){
      float tg=0.6*(s-0.05)+phi;
      float rl=0.85*rloc;
      float lat=rl*cos(tg), gz=rl*sin(tg);
      float gw=(2.5+6.*(s-0.05))*max(abs(sin(tg)),0.25);
      float dg=abs(v-lat)-gw;
      float bg=blurAt(gz);
      float gm=fillD(dg,bg)*m*(0.45+0.55*smoothstep(-0.3,0.5,sin(tg)));
      float shimmer=0.6+0.4*sin(u*2.4-uBeat*6.2831);
      OD+=gm*vec3(0.17,0.15,0.11)*shimmer; SC+=gm*0.25*shimmer;
    }
    float dcy=length(vec2(u-0.05*hl,v-0.7*rloc*cos(phi)))-5.;
    OD+=m*fillD(dcy,blurAt(0.7*rloc*sin(phi)))*vec3(0.18,0.16,0.12);
  }
  // cilia: hairs on the silhouette, metachronal wave 27 µm, 30 Hz beat (jana2012)
  if(d>-0.6&&d<14.+2.*b0){
    float a=hl, bb=rr;
    float E=atan(vn,s);
    float per=(a+bb)*3.14159265;
    float spc=per/floor(per/2.);
    float t=(a+bb)*0.5*E-(a-bb)*0.25*sin(2.*E);
    float hgt=max(d,0.);
    float ph=6.2831853*(t/27.-uBeat);
    float dirS=v>=0.?1.:-1.;
    float lean=dirS*(0.6+0.55*sin(ph)+0.2*sin(2.*ph));
    float ca=cos(lean);
    float xo=hgt*tan(clamp(lean,-1.2,1.2));
    float qq=(t-xo)/spc;
    float dh=abs(fract(qq+0.5)-0.5)*spc*ca;
    float tuft=1.+0.6*smoothstep(0.8,1.,abs(E)/3.14159);
    float clen=11.*ca*tuft;
    float hw=max(0.15,0.5/uPx);
    float hairs=(1.-smoothstep(hw,hw+0.8/uPx,dh))*(1.-smoothstep(clen-1.,clen,hgt))*smoothstep(-0.6,0.2,d);
    float fringe=(1.-smoothstep(5.*tuft,11.*tuft,hgt))*smoothstep(-0.6,0.2,d)*(0.55+0.45*sin(ph));
    float lod=smoothstep(2.5,5.,spc*uPx);
    hairs*=1.-0.6*smoothstep(0.3*clen,clen,hgt);
    float cil=mix(fringe*0.14,hairs*0.55,lod)/(1.+b0*b0);
    OD+=cil*vec3(0.5,0.48,0.45); SC+=cil*1.3;
  }
}

void amoeba(vec2 p, vec4 A, vec4 B, vec4 C){
  vec2 q=p-A.xy; float R0=B.x; float r=length(q);
  float b0=blurAt(0.);
  if(r>R0*2.4+30.+3.*b0) return;
  float th=atan(q.y,q.x);
  float R=R0*(0.9+0.05*sin(3.*th+uT*0.35+B.y)+0.03*sin(7.*th-uT*0.5));
  for(int i=0;i<5;i++){
    float fi=float(i);
    float ang=A.z+(fi-2.)*0.95+0.35*sin(uT*0.11+fi*2.1+B.y);
    float grow=0.5+0.5*sin(uT*(0.16+0.05*fi)+fi*1.7+B.y);
    float ext=i==2?R0*(0.95+0.15*grow):R0*(0.12+0.7*grow);
    float wd=(40.+12.*grow)/(R0+ext*0.6);
    float da=atan(sin(th-ang),cos(th-ang));
    R+=ext*exp(-da*da/(wd*wd));
  }
  float dsq=atan(sin(th-A.w),cos(th-A.w));
  R*=1.-B.z*exp(-dsq*dsq/0.3)+0.25*B.z*(1.-exp(-dsq*dsq/0.3));
  float d=(r-R)*0.8;
  float m=fillD(d,b0);
  if(d>4.*b0+3.) { HALO+=ringD(d-1.5,1.2,b0)*becke(0.); return; }
  vec2 dir=vec2(cos(A.z),sin(A.z));
  OD+=m*vec3(0.04,0.04,0.05);
  float rim=ringD(d+0.6,0.8,b0); OD+=rim*vec3(0.35,0.33,0.30); SC+=rim*vec3(0.9);
  HALO+=ringD(d-1.5,1.2,b0)*becke(0.);
  float endo=fillD(d+9.,b0+2.);
  vec2 fl=dir*uT*7.;
  float g=fillD(gran(q-fl,2.4,B.y),max(b0,0.35/uPx))+0.6*fillD(gran(q-fl*0.7+0.7,3.3,B.y+1.),max(blurAt(6.),0.35/uPx));
  float gd=detail(1.8,b0);
  OD+=endo*(vec3(0.07,0.07,0.06)+g*0.2*gd);
  SC+=endo*vec3(g*0.5*gd+0.03);
  vec2 cq=(q-fl*0.8)/9.; vec2 ci=floor(cq); vec2 ch=h22(ci+B.y);
  if(ch.x<0.45){
    vec2 dq=rot(ch.y*6.28)*((q-fl*0.8)-(ci+0.25+0.5*h22(ci+9.))*9.);
    float dd=(abs(dq.x)*0.8+abs(dq.y)*1.4)-1.5;
    float bz=blurAt((ch.y-0.5)*30.);
    float mc=fillD(dd,bz)*endo*detail(2.,bz);
    OD+=mc*0.22; SC+=mc*1.5;
  }
  vec2 nc=-dir*R0*0.25+8.*vec2(sin(uT*0.05),cos(uT*0.04));
  float dn=length(q-nc)-20.; float bn=blurAt(4.);
  OD+=m*(fillD(dn,bn)*vec3(0.07,0.08,0.06)+ringD(dn,1.2,bn)*0.24+ringD(length(q-nc)-11.,2.,bn)*0.05);
  SC+=m*ringD(dn,1.2,bn)*0.55;
  float cyc=fract(uT/8.+B.y); float rad=cyc<0.85?mix(3.,14.,cyc/0.85):mix(14.,2.,(cyc-0.85)/0.15);
  float dv=length(q+dir*R0*0.7)-rad; float bv=blurAt(6.);
  OD+=m*(ringD(dv,0.8,bv)*0.25-fillD(dv,bv)*0.09); SC+=m*ringD(dv,0.8,bv)*0.7;
  for(int k=0;k<4;k++){
    float fk=float(k);
    float full=k==0?C.x:k==1?C.y:k==2?C.z:C.w;
    if(full<0.02) continue;
    vec2 fc=vec2(cos(fk*1.9+uT*0.05+B.y),sin(fk*2.7+uT*0.04))*R0*0.45;
    float df=length(q-fc)-(7.+3.*h11(fk+B.y))*(0.3+0.7*full); float bf=blurAt((h11(fk+3.)-0.5)*20.);
    vec3 col=k<2?vec3(0.45,0.12,0.40):vec3(0.15,0.25,0.42);
    vec3 sc=k<2?vec3(0.5,1.,0.4):vec3(1.,0.8,0.5);
    OD+=m*(fillD(df,bf)*col+ringD(df,0.8,bf)*0.2); SC+=m*ringD(df,0.8,bf)*sc*0.6;
  }
}

void euglena(vec2 p, vec4 A, vec4 B){
  float L=B.x, Wd=B.y, hl=L*0.5;
  vec2 q=p-A.xy; vec2 ax=vec2(cos(A.z),sin(A.z));
  float u=dot(q,ax), v=dot(q,vec2(-ax.y,ax.x));
  float b0=blurAt(0.);
  if(u<-hl-12.-3.*b0||u>hl+L+12.||abs(v)>Wd*1.6+14.+3.*b0) return;
  float s=clamp(u/hl,-1.5,1.5); float phi=A.w;
  float mb=B.z;
  float sm=sin(uT*1.3+B.w*6.)*0.6;
  float rr=Wd*0.5*(1.+0.12*s)*(1.+0.9*mb*exp(-pow((s-sm)/0.35,2.)));
  float pn=mix(1.25,2.2,smoothstep(-0.6,0.5,s));
  float vn=v/rr;
  float f=pow(pow(abs(s),pn)+pow(abs(vn),pn),1./pn);
  float g=length(vec2(s/hl,vn/rr))/max(length(vec2(s,vn)),1e-3);
  float d=(f-1.)/max(g,1e-4);
  float m=fillD(d,b0);
  float rloc=rr*pow(max(1.-pow(min(abs(s),1.),pn),0.),1./pn)+1e-3;
  OD+=m*vec3(0.10,0.05,0.10);
  float rim=ringD(d+0.4,0.5,b0); OD+=rim*vec3(0.32,0.28,0.30); SC+=rim*vec3(0.8,1.,0.85);
  HALO+=ringD(d-0.8,0.7,b0)*becke(0.);
  if(d<0.5){
    float w=clamp(v/rloc,-1.,1.); float psi=acos(w)-phi;
    float zt=rloc*sqrt(1.-w*w);
    float strip=0.5+0.5*cos(psi*24.+s*9.);
    OD+=m*strip*0.07*detail(1.2,blurAt(zt));
    for(int k=0;k<9;k++){
      float fk=float(k);
      float ks=-0.62+fk*0.15+0.03*sin(fk*3.);
      float th=fk*2.4+0.3+phi;
      float rl=rr*pow(max(1.-pow(abs(ks),pn),0.),1./pn);
      float lat=0.6*rl*cos(th), zz=0.6*rl*sin(th);
      vec2 dd=vec2(u-ks*hl,v-lat);
      float dc=(length(dd/vec2(3.4,1.6+1.2*abs(sin(th))))-1.)*2.;
      float bc=blurAt(zz);
      float mc=fillD(dc,bc)*m;
      OD+=mc*vec3(0.78,0.20,0.72); SC+=mc*vec3(0.25,0.8,0.2)*0.8;
    }
    float rl2=rr*0.5; float latE=0.45*rl2*cos(1.+phi); float zE=0.45*rl2*sin(1.+phi);
    float de=(length(vec2(u-0.76*hl,v-latE)/vec2(2.2,1.6))-1.)*1.6;
    float me=fillD(de,blurAt(zE))*m;
    OD+=me*vec3(0.05,0.95,0.9); SC+=me*vec3(1.,0.25,0.15);
    float dr=length(vec2(u-0.88*hl,v))-2.4;
    OD+=m*(ringD(dr,0.4,b0)*0.12-fillD(dr,b0)*0.06);
    float dn=(length(vec2(u+0.05*hl,v)/vec2(5.,4.))-1.)*4.;
    OD+=m*(ringD(dn,0.5,b0)*0.12-fillD(dn,b0)*0.05);
    for(int k=0;k<5;k++){
      float fk=float(k);
      vec2 pc=vec2((-0.4+fk*0.2)*hl,(h11(fk+B.w)-0.5)*rloc*0.8);
      float dp=(length((vec2(u,v)-pc)/vec2(1.6,1.0))-1.)*1.;
      OD+=m*ringD(dp,0.3,b0)*0.12*detail(1.,b0);
    }
  }
  float x=u-hl*0.92;
  if(x>0.&&x<L*0.9){
    float t=x/(L*0.9);
    float amp=0.8+5.*t;
    float ph=6.2831*(x/22.-uT*2.2);
    float y=amp*sin(ph); float dy=amp*6.2831/22.*cos(ph);
    float dist=abs(v-y)/sqrt(1.+dy*dy);
    float bf=blurAt(amp*cos(ph)*0.5);
    float mf=fillD(dist-0.3,max(bf,0.5/uPx))*min(1.,0.5/bf);
    OD+=mf*0.5; SC+=mf*1.2;
  }
}

void bacteriaGrid(vec2 p){
  float G=9.; vec2 base=floor(p/G-0.5);
  for(int j=0;j<4;j++){
    vec2 c=base+vec2(mod(float(j),2.),floor(float(j)*0.5));
    vec2 h=h22(c); if(h.x>0.62) continue;
    vec2 ctr=(c+0.3+0.4*h22(c+5.3))*G+0.3*vec2(sin(uT*3.1+h.x*50.),cos(uT*2.7+h.y*50.));
    float z=(h21(c+9.1)-0.5)*3.;
    float b=blurAt(z);
    vec2 q=p-ctr; float d=1e3;
    if(h.y<0.62){
      q=rot(h21(c+2.2)*6.2831+0.3*sin(uT*0.8+h.x*9.))*q;
      d=length(vec2(max(abs(q.x)-0.65,0.),q.y))-0.35;
    } else {
      for(int k=0;k<5;k++){
        float fk=float(k);
        float an=fk*2.4+h.y*20.;
        vec2 o=fk<0.5?vec2(0.):vec2(cos(an),sin(an))*(fk<2.5?0.85:1.5);
        d=min(d,length(q-o)-0.45);
      }
    }
    float e=0.3/(0.3+b*b);
    OD+=(fillD(d,b)*vec3(0.34,0.34,0.30)+ringD(d,0.25,b)*0.35)*e;
    SC+=(ringD(d,0.25,b)*1.7+fillD(d,b)*0.3)*e;
    HALO+=ringD(d-0.4,0.3,b)*clamp(uFocus-z,-1.,1.)*e;
  }
}
void microbe(vec2 p, vec4 A, vec4 B){
  vec2 q=p-A.xy; vec2 ax=vec2(cos(A.z),sin(A.z));
  float u=dot(q,ax), v=dot(q,vec2(-ax.y,ax.x));
  float hl=B.y*0.5; float d; float z=0.;
  if(abs(u)>hl+4.||abs(v)>6.) return;
  if(B.x<0.5){
    float lam=B.y/3.;
    float ph=6.2831*u/lam+A.w;
    float amp=2.2;
    float y=amp*sin(ph); float dy=amp*6.2831/lam*cos(ph);
    d=max(abs(v-y)/sqrt(1.+dy*dy)-0.75,abs(u)-hl);
    z=amp*cos(ph)*0.25;
  } else {
    d=length(vec2(max(abs(u)-(hl-0.35),0.),v))-0.35;
  }
  float b=blurAt(z); float e=B.x<0.5?0.9/(0.9+b):0.4/(0.4+b*b);
  OD+=(fillD(d,b)*vec3(0.34,0.32,0.28)+ringD(d,0.3,b)*0.35)*e;
  SC+=(ringD(d,0.3,b)*1.7+fillD(d,b)*0.3)*e;
}
void yeastGrid(vec2 p){
  float G=13.; vec2 base=floor(p/G-0.5);
  for(int j=0;j<4;j++){
    vec2 c=base+vec2(mod(float(j),2.),floor(float(j)*0.5));
    vec2 h=h22(c); if(h.x>0.72) continue;
    vec2 ctr=(c+0.32+0.36*h22(c+5.3))*G+0.12*vec2(sin(uT*2.1+h.x*50.),cos(uT*1.7+h.y*50.));
    float z=(h21(c+9.1)-0.5)*4.;
    float b=blurAt(z);
    vec2 q=rot(h21(c+2.2)*6.2831)*(p-ctr);
    float rm=2.5*(0.92+0.16*h21(c+6.));
    float dm=(length(q/vec2(1.06,0.95))-rm);
    float d=dm;
    float bud=h21(c+8.);
    if(bud<0.65){
      float rb=rm*mix(0.35,0.84,h21(c+11.));
      float db=length(q-vec2(rm*1.02+rb*0.8,0.))-rb;
      float k=0.5; float hh=clamp(0.5+0.5*(db-dm)/k,0.,1.);
      d=mix(db,dm,hh)-k*hh*(1.-hh);
    }
    float dv=length(q+vec2(0.5,0.3))-rm*0.42;
    float e=6./(6.+b*b);
    float m=fillD(d,b);
    OD+=m*vec3(0.12,0.11,0.08)+ringD(d+0.15,0.3,b)*0.55*e;
    OD+=fillD(dm,b)*(ringD(dv,0.25,b)*0.2*detail(1.,b)-fillD(dv,b)*0.05);
    float gr=vnoise(q*2.5+h*9.); OD+=m*smoothstep(0.7,0.9,gr)*0.12*detail(0.5,b);
    SC+=ringD(d,0.3,b)*1.4*e+m*0.08;
    HALO+=ringD(d-0.5,0.4,b)*clamp((uFocus-z)/1.5,-1.,1.);
  }
}
void diatom(vec2 p, vec4 A, vec4 B){
  float L=B.x, Wd=B.y, hl=L*0.5, hw=Wd*0.5;
  vec2 q=p-A.xy; vec2 ax=vec2(cos(A.z),sin(A.z));
  float u=dot(q,ax), v=dot(q,vec2(-ax.y,ax.x));
  float b0=blurAt(0.);
  if(abs(u)>hl+8.+3.*b0||abs(v)>hw+8.+3.*b0) return;
  float tn=abs(u)/hl;
  float rw=hw*(1.-0.22*pow(tn,6.));
  float d=length(vec2(max(abs(u)-(hl-rw),0.),v))-rw;
  float m=fillD(d,b0);
  float rim=ringD(d+0.7,0.9,b0);
  OD+=m*vec3(0.04,0.05,0.07)+rim*vec3(0.55,0.52,0.45);
  SC+=rim*vec3(1.2);
  HALO+=ringD(d-1.2,1.,b0)*becke(0.);
  if(d>0.5) return;
  float bt=blurAt(4.);
  float axial=1.6+3.4*exp(-pow(u/6.,2.));
  float ribs=0.5+0.5*cos(6.2831*u/1.1);
  float ribMask=smoothstep(axial,axial+0.6,abs(v))*smoothstep(-0.3,-1.5,d);
  float dr=detail(0.55,bt);
  OD+=m*ribMask*ribs*0.24*dr; SC+=m*ribMask*ribs*0.4*dr;
  float e=max(abs(u)-hl*0.8,0.);
  float hook=e*e*0.12*sign(u);
  float rd=abs(v-hook)-0.18;
  float gap=step(2.,abs(u))*step(abs(u),hl*0.94);
  float rm=fillD(rd,bt)*gap*detail(0.4,bt)*m;
  OD+=rm*0.4; SC+=rm*0.7;
  for(int k=0;k<2;k++){
    float sg=k==0?1.:-1.;
    float dp=length(vec2(max(abs(u)-hl*0.6,0.),v-sg*hw*0.5))-hw*0.32;
    float mp=fillD(dp,blurAt(-1.))*m;
    OD+=mp*vec3(0.16,0.36,0.85)*0.85; SC+=mp*vec3(1.,0.75,0.35)*0.45;
  }
  for(int k=0;k<3;k++){
    float fk=float(k);
    float dd=length(vec2(u-(fk-1.)*hl*0.45,v))-1.6;
    float bo=blurAt(1.);
    OD+=m*ringD(dd,0.3,bo)*0.25*detail(1.,bo); SC+=m*ringD(dd,0.3,bo)*0.6*detail(1.,bo);
  }
}
// single yeast cell with an optional bud (B.x radius, B.y bud radius / mother radius, B.z seed)
void yeastOne(vec2 p, vec4 A, vec4 B){
  float rm=B.x; vec2 q=rot(-A.z)*(p-A.xy);
  float b=blurAt(0.);
  if(length(q)>rm*3.+4.*b+2.) return;
  float dm=length(q/vec2(1.06,0.95))-rm; float d=dm;
  if(B.y>0.05){
    float rb=rm*B.y; float db=length(q-vec2(rm*1.02+rb*0.8,0.))-rb;
    float k=0.5*B.y; float hh=clamp(0.5+0.5*(db-dm)/k,0.,1.);
    d=mix(db,dm,hh)-k*hh*(1.-hh);
  }
  float dv=length(q+vec2(0.5,0.3)*rm/2.5)-rm*0.42;
  float e=6./(6.+b*b);
  float m=fillD(d,b);
  OD+=m*vec3(0.12,0.11,0.08)+ringD(d+0.15,0.3,b)*0.55*e;
  OD+=fillD(dm,b)*(ringD(dv,0.25,b)*0.2*detail(1.,b)-fillD(dv,b)*0.05);
  SC+=ringD(d,0.3,b)*1.4*e+m*0.08;
  HALO+=ringD(d-0.5,0.4,b)*becke(0.)*e;
}
// green alga, Chlorella-like sphere with a cup-shaped chloroplast (B.x radius, B.y seed)
void algaOne(vec2 p, vec4 A, vec4 B){
  float r=B.x; vec2 q=p-A.xy; float b=blurAt(0.);
  if(length(q)>r+3.+4.*b) return;
  float d=length(q)-r; float m=fillD(d,b); float e=3./(3.+b*b);
  vec2 off=0.28*r*vec2(cos(B.y*6.2831),sin(B.y*6.2831));
  float dc=length(q-off)-r*0.72;
  float mc=fillD(dc,b)*m;
  OD+=m*vec3(0.05,0.04,0.06)+mc*vec3(0.62,0.14,0.56)+ringD(d,0.3,b)*0.35*e;
  SC+=ringD(d,0.3,b)*1.3*e+mc*vec3(0.25,0.8,0.2)*0.7;
  HALO+=ringD(d-0.4,0.35,b)*becke(0.)*e;
}

`;

export const MAIN = `uniform int uKind, uN;
uniform vec4 uA[8]; uniform vec4 uB[8];
uniform float uArena; uniform vec3 uLight;
void main(){
  vec2 dc=gl_FragCoord.xy-uC; float rr=length(dc);
  float outer=uR+7.*uDpr;
  if(rr>outer+1.){ gl_FragColor=vec4(0.); return; }
  vec2 p=uCam+dc/uPx;
  OD=vec3(0.); SC=vec3(0.); HALO=0.; ZOFF=0.; LIGHT=0.;
  debris(p, uKind>=3&&uKind<=4?0.25:0.55);
  if(uArena>0.){
    float da=length(p)-uArena; float bb=blurAt(0.);
    OD+=vec3(0.07,0.06,0.05)*smoothstep(0.,30.,da)+ringD(da,5.,bb)*vec3(0.35,0.33,0.30);
    SC+=ringD(da,5.,bb)*0.9; HALO+=ringD(da+9.,4.,bb)*0.8;
  }
  if(uLight.z>0.){ float dl=length(p-uLight.xy)/uLight.z; LIGHT=exp(-dl*dl); }
  if(uKind==3) bacteriaGrid(p);
  if(uKind==4) yeastGrid(p);
  for(int i=0;i<8;i++){
    if(i>=uN) break;
    if(uKind==0) para(p,uA[i],uB[i]);
    else if(uKind==1) amoeba(p,uA[i],uB[i],vec4(1.));
    else if(uKind==2) euglena(p,uA[i],uB[i]);
    else if(uKind==3) microbe(p,uA[i],uB[i]);
    else if(uKind==5) diatom(p,uA[i],uB[i]);
  }
  float rn=rr/uR;
  float illum=1.-0.22*rn*rn;
  vec3 col;
  OD=max(OD,vec3(0.));
  if(uMode==0){ col=vec3(0.955,0.925,0.83)*illum*(1.+vec3(0.10,0.08,0.02)*LIGHT)*exp(-OD)+HALO*0.18; }
  else { col=1.-exp(-(vec3(0.012,0.014,0.02)+vec3(0.05,0.04,0.)*LIGHT+SC*vec3(0.80,0.88,1.0)*illum)*1.25); }
  col*=1.-0.38*smoothstep(0.55,1.,rn);
  // slight lateral colour at the field stop: warm outer rim, cool inner rim
  float fo=smoothstep(0.93,0.99,rn)*(1.-smoothstep(0.99,1.,rn)), fi=smoothstep(0.86,0.93,rn)*(1.-smoothstep(0.93,0.97,rn));
  float fk=uMode==0?1.:0.5;
  col+=fk*(vec3(0.05,0.01,-0.03)*fo+vec3(-0.02,0.,0.035)*fi);
  col+=(h21(gl_FragCoord.xy+fract(uT))-0.5)/255.;
  float inside=1.-smoothstep(uR-1.5*uDpr,uR+0.5*uDpr,rr);
  col=mix(vec3(0.035,0.04,0.045),col,inside);
  float a=1.-smoothstep(outer-1.,outer+1.,rr);
  gl_FragColor=vec4(col*a,a);
}`;
