// news.js — the "News" screen: update articles, newest first. A dot on the button marks an article not read yet.
const SEEN = 'blackPyramid.newsSeen';

export const ARTICLES = [
  {
    id: 'legends-teaser',
    date: 'נובמבר 2026',
    tag: 'בקרוב',
    title: 'אגדות נפירה',
    sub: 'כל אגדה מתחילה בזיכרון אחד.',
    image: 'news/legends-teaser.jpg',
    imageAlt: 'נפירה עולה אל השמיים מעל המדבר, והכיתוב: אגדות נפירה, בקרוב',
    body: [
      'מי שהגיע עד הסוף של <b>משמר הפירמידה השחורה</b> כבר ראה את זה: אחרי שהכול נגמר, נפירה עוצרת לרגע, לוחשת משהו על העבר, ואז… נעלמת.',
      'לאן היא הלכה? למה דווקא עכשיו? ומה היא ראתה ברגע שלפני?',
      'שלושת אלפים שנה היא שמרה על המדבר בתור רוח. אבל מה היה לפני הרוח? מי הייתה נפירה כשעוד היו לה צעדים שמשאירים עקבות בחול?',
    ],
    hints: [
      'עיר שכולם שכחו, ביום שבו עוד היו בה אנשים.',
      'אח ואחות. שמש אחת. ופחד אחד שאף אחד לא דיבר עליו.',
      'שבעה זיכרונות. אולי כבר אספתם אותם, בלי לדעת של מי הם באמת.',
      'המילה החשובה ביותר במשחק הזה לא תהיה "תקוף".',
      'חארו פקח את עיניו בתחילת המשחק הראשון. תהיתם פעם מה קרה רגע לפני?',
      'סוף אחד. רק אחד.',
    ],
    outro: [
      'יש לכם תאוריה? שמרו אותה. אולי אתם צודקים, ואולי לא.',
      '<span class="news-small">תאריך יציאה: עוד לא נקבע. המשחק בתכנון, וכל מה שכתוב כאן עוד עשוי להשתנות.</span>',
    ],
  },
];

export function createNews({ $, onOpen } = {}) {
  const el = $('news'), list = $('news-body'), btns = [...document.querySelectorAll('.btn-news')];
  const seen = () => { try { return JSON.parse(localStorage.getItem(SEEN)) || []; } catch { return []; } };
  const markDots = () => { const s = seen(); const unread = ARTICLES.some((a) => !s.includes(a.id)); btns.forEach((b) => b.classList.toggle('unread', unread)); };
  function render() {
    list.innerHTML = ARTICLES.map((a) => `
      <article class="news-item">
        <div class="news-meta"><span class="news-tag">${a.tag}</span> ${a.date}</div>
        <h2>${a.title}</h2>
        <p class="news-sub">${a.sub}</p>
        ${a.image ? `<img class="news-img" src="${a.image}" alt="${a.imageAlt || ''}" loading="lazy">` : ''}
        ${a.body.map((p) => `<p>${p}</p>`).join('')}
        ${a.hints?.length ? `<h3>מה אפשר לגלות (ומה לא)</h3><ul class="news-hints">${a.hints.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}
        ${(a.outro || []).map((p) => `<p>${p}</p>`).join('')}
      </article>`).join('');
  }
  function open() {
    render(); el.classList.remove('hidden'); el.scrollTop = 0; list.scrollTop = 0;
    try { localStorage.setItem(SEEN, JSON.stringify(ARTICLES.map((a) => a.id))); } catch { /* ignore */ }
    markDots(); onOpen?.();
  }
  function close() { el.classList.add('hidden'); }
  btns.forEach((b) => b.addEventListener('click', open));
  $('news-close').addEventListener('click', close);
  markDots();
  return { open, close, get isOpen() { return !el.classList.contains('hidden'); } };
}
