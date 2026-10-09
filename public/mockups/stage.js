// Taslak sahnesi: oyundaki gibi 1080 mantıksal yükseklik, genişlik 1920..2580; üstte 1-3 sekmeleri (?v=1..3, klavyede 1-3).
window.mockStage = function (title, names, render) {
  const stage = document.getElementById('stage');
  const tabs = document.getElementById('tabs');
  const q = new URLSearchParams(location.search);
  let v = Math.min(names.length, Math.max(1, Number(q.get('v')) || 1));
  const S = { W: 1920, sc: 1 };
  const draw = () => {
    tabs.innerHTML = `<span class="lbl">${title}</span>` + names.map((n, i) => `<button class="${v === i + 1 ? 'on' : ''}" data-v="${i + 1}"><b>${i + 1}</b>${n}</button>`).join('') + `<a href="./index.html">all mockups</a>`;
    stage.innerHTML = '';
    render(v, stage, S);
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; v = Number(b.dataset.v); history.replaceState(null, '', `?v=${v}`); draw(); });
  addEventListener('keydown', (e) => { if (/^[1-9]$/.test(e.key) && Number(e.key) <= names.length) { v = Number(e.key); history.replaceState(null, '', `?v=${v}`); draw(); } });
  const fit = () => {
    const T = 40, vw = innerWidth, vh = innerHeight - T;
    const W = Math.round(Math.min(2580, Math.max(1920, (vw / vh) * 1080)));
    const sc = Math.min(vw / W, vh / 1080);
    stage.style.width = W + 'px';
    stage.style.transform = `translate(${(vw - W * sc) / 2}px, ${T + (vh - 1080 * sc) / 2}px) scale(${sc})`;
    const changed = W !== S.W; S.W = W; S.sc = sc;
    if (changed && stage.childElementCount) draw();
  };
  addEventListener('resize', fit);
  fit();
  document.fonts.load('600 32px Cinzel').finally(draw);
  return S;
};
