// PayBridge landing page — small interactions only.

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Copy buttons (attribution tag, agent wallet)
document.querySelectorAll('.copy-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy') || '';
    var done = function () {
      var original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = original; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });
});

function fallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { /* copy unavailable */ }
  document.body.removeChild(ta);
}
