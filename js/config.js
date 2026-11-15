// 接続先（Apps Script ウェブアプリの URL）
window.GAMBIZ_CONFIG = { api: 'https://script.google.com/macros/s/AKfycbyoK0uApFCLD6IwdfE4dlvaNNQ_GbBvvU6qCdRAqWu9pfpcat2fZv1m2FGXOl-Kazei/exec' };
// 開発用：手元（localhost）で ?mock を付けたときだけ、手元の擬似 API につなぐ
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]mock/.test(location.search)) {
  window.GAMBIZ_CONFIG.api = 'http://127.0.0.1:5191/';
}
