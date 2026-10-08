/* Non-browser environment for Flixer WASM2JS compatibility in Hermes. */
(function(g){
 var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
 if(typeof g.Window!=="function")g.Window=function WindowShim(){};
 if(typeof g.HTMLCanvasElement!=="function")g.HTMLCanvasElement=function HTMLCanvasElementShim(){this.width=250;this.height=200;};
 if(typeof g.CanvasRenderingContext2D!=="function")g.CanvasRenderingContext2D=function CanvasRenderingContext2DShim(){this.font="12px sans-serif";this.textBaseline="top";};
 if(typeof g.CanvasRenderingContext2D.prototype.fillText!=="function")g.CanvasRenderingContext2D.prototype.fillText=function(){};
 if(typeof g.HTMLCanvasElement.prototype.getContext!=="function")g.HTMLCanvasElement.prototype.getContext=function(){return new g.CanvasRenderingContext2D();};
 if(typeof g.HTMLCanvasElement.prototype.toDataURL!=="function")g.HTMLCanvasElement.prototype.toDataURL=function(){return"data:image/png;base64,"+Array(51).join("AAAA");};
 if(typeof g.HTMLCanvasElement.prototype.setAttribute!=="function")g.HTMLCanvasElement.prototype.setAttribute=function(){};
 if(typeof g.HTMLCanvasElement.prototype.getAttribute!=="function")g.HTMLCanvasElement.prototype.getAttribute=function(){return null;};
 var win=(g.window && g.window instanceof g.Window)?g.window:new g.Window();
 if(!g.window)g.window=win;
 if(!g.self)g.self=win;
 if(!g.screen)g.screen={width:1365,height:900,colorDepth:24};
 var nav={userAgent:UA,platform:"Win32",language:"en-US"};
 if(!g.navigator)g.navigator=nav;
 else{try{if(!g.navigator.userAgent)g.navigator.userAgent=UA;}catch(_){}}
 var timeOrigin=Date.now()-15000;
 if(!g.performance||typeof g.performance.now!=="function")g.performance={now:function(){return Date.now()-timeOrigin;},timeOrigin:timeOrigin};
 var values={};
 if(!g.localStorage)g.localStorage={
  getItem:function(k){return Object.prototype.hasOwnProperty.call(values,k)?values[k]:null;},
  setItem:function(k,v){values[k]=String(v);},removeItem:function(k){delete values[k];}
 };
 if(!g.document)g.document={
  getElementsByTagName:function(t){return t==="body"?[{tagName:"BODY"}]:[];},
  createElement:function(t){return t==="canvas"?new g.HTMLCanvasElement():{tagName:String(t).toUpperCase()};}
 };
 win.window=win;win.self=win;win.screen=g.screen;
 win.navigator=g.navigator;win.document=g.document;win.performance=g.performance;win.localStorage=g.localStorage;
 if(typeof g.TextEncoder!=="function")g.TextEncoder=function TextEncoderShim(){};
 if(typeof g.TextEncoder.prototype.encode!=="function")g.TextEncoder.prototype.encode=function(s){
  s=String(s);var a=[];
  for(var i=0;i<s.length;i++){
   var c=s.charCodeAt(i);
   if(c>=0xd800&&c<=0xdbff&&i+1<s.length){var d=s.charCodeAt(i+1);if(d>=0xdc00&&d<=0xdfff){c=0x10000+((c-0xd800)<<10)+(d-0xdc00);i++;}}
   if(c<128)a.push(c);
   else if(c<2048)a.push(192|(c>>6),128|(c&63));
   else if(c<65536)a.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
   else a.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));
  }return new Uint8Array(a);
 };
 if(typeof g.TextDecoder!=="function")g.TextDecoder=function TextDecoderShim(){};
 if(typeof g.TextDecoder.prototype.decode!=="function")g.TextDecoder.prototype.decode=function(b){
  var s="",i=0;b=b||new Uint8Array(0);
  while(i<b.length){
   var c=b[i++],cp=c;
   if(c>=240&&i+2<b.length){cp=((c&7)<<18)|((b[i++]&63)<<12)|((b[i++]&63)<<6)|(b[i++]&63);}
   else if(c>=224&&i+1<b.length){cp=((c&15)<<12)|((b[i++]&63)<<6)|(b[i++]&63);}
   else if(c>=192&&i<b.length){cp=((c&31)<<6)|(b[i++]&63);}
   if(cp>65535){cp-=65536;s+=String.fromCharCode(0xd800+(cp>>10),0xdc00+(cp&1023));}
   else s+=String.fromCharCode(cp);
  }return s;
 };
})(typeof globalThis!=="undefined"?globalThis:this);
