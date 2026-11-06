/* Hayyakum folds a final yaa under a word-initial faa («في»، «وفي»), so the two letters overlap.
   A tatweel between them keeps them apart. Display only: what is stored and what people type stays as it is. */
(function(){
  var NEED=/ف[يى]/, RE=/(^|[^ئب-غف-هيـ])ف(?=[يى](?![ء-ي]))/g;
  function fix(root){
    if(!root||!NEED.test((root.textContent||'')+(root.innerHTML||''))) return;
    var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), n, list=[];
    while((n=w.nextNode())) if(NEED.test(n.nodeValue)) list.push(n);
    list.forEach(function(t){ var p=t.parentElement; if(!p||/^(SCRIPT|STYLE|TEXTAREA)$/.test(p.tagName)||p.isContentEditable) return;
      if(!/^\s*["']?Hayyakum/i.test(getComputedStyle(p).fontFamily)) return;
      var v=t.nodeValue.replace(RE,'$1فـ'); if(v!==t.nodeValue) t.nodeValue=v; });
    // the hint text inside empty fields too
    [].forEach.call(root.querySelectorAll?root.querySelectorAll('[placeholder]'):[],function(el){ var p=el.getAttribute('placeholder'); if(NEED.test(p)&&/^\s*["']?Hayyakum/i.test(getComputedStyle(el).fontFamily)){ var v=p.replace(RE,'$1فـ'); if(v!==p) el.setAttribute('placeholder',v); } });
  }
  function start(){ fix(document.body);
    new MutationObserver(function(ms){ ms.forEach(function(m){
      if(m.type==='characterData'){ fix(m.target.parentElement); return; }
      m.addedNodes.forEach(function(x){ fix(x.nodeType===1?x:x.parentElement); }); }); })
      .observe(document.body,{childList:true,subtree:true,characterData:true}); }
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start);
})();
