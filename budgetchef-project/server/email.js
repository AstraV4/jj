// Envoi d'e-mails via Resend (https://resend.com). Utilise les variables Railway :
//   RESEND_API_KEY, MAIL_FROM, SITE_NAME, APP_URL, DISCORD_HANDLE
// En l'absence de RESEND_API_KEY (ex. en local), on n'envoie rien : le lien est
// simplement affiche dans la console pour pouvoir tester le parcours.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';
const SITE_NAME = process.env.SITE_NAME || 'BudgetChef Pro';
const DISCORD_HANDLE = process.env.DISCORD_HANDLE || '';

// Construit un champ "from" valide pour Resend, quel que soit le format de MAIL_FROM :
//  - "no-reply@domaine.fr"            -> "BudgetChef Pro <no-reply@domaine.fr>"
//  - "BudgetChef Pro <no@dom.fr>"     -> utilisé tel quel (pas de double emballage)
function buildFrom() {
  const raw = String(MAIL_FROM).trim();
  if (raw.includes('<') && raw.includes('>')) return raw;
  const name = String(SITE_NAME).replace(/[<>"\r\n]/g, '').trim();
  return `${name} <${raw}>`;
}

async function send({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`\n[email:dev] (RESEND_API_KEY absente) À: ${to}\n[email:dev] Sujet: ${subject}\n`);
    return { dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: buildFrom(), to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`resend_error ${res.status} ${detail}`);
  }
  return res.json();
}

function shell(title, bodyHtml) {
  const footer = DISCORD_HANDLE ? `<p style="color:#94a3b8;font-size:12px;margin-top:24px">Besoin d'aide ? Contacte-nous : ${DISCORD_HANDLE}</p>` : '';
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:32px 28px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
    <div style="font-weight:700;font-size:18px;color:#0f172a;margin-bottom:20px">🥗 ${SITE_NAME}</div>
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 12px">${title}</h1>
    ${bodyHtml}
    ${footer}
  </div>`;
}

function button(url, label) {
  return `<a href="${url}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px;margin:12px 0">${label}</a>
    <p style="color:#94a3b8;font-size:12px;margin-top:12px">Ou copie-colle ce lien : <br>${url}</p>`;
}

export function sendVerificationEmail(to, verifyUrl) {
  if (!RESEND_API_KEY) console.log(`[email:dev] Lien de vérification pour ${to} :\n${verifyUrl}\n`);
  return send({
    to,
    subject: `Confirme ton adresse — ${SITE_NAME}`,
    html: shell('Confirme ton adresse e-mail',
      `<p style="color:#475569;font-size:14px;line-height:1.6">Bienvenue ! Clique sur le bouton ci-dessous pour activer ton compte et commencer à planifier tes repas.</p>
       ${button(verifyUrl, 'Vérifier mon adresse')}
       <p style="color:#94a3b8;font-size:12px">Ce lien expire dans 24 h. Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.</p>`),
  });
}

export function sendAlreadyRegisteredEmail(to, loginUrl) {
  return send({
    to,
    subject: `Tu as déjà un compte — ${SITE_NAME}`,
    html: shell('Tu as déjà un compte',
      `<p style="color:#475569;font-size:14px;line-height:1.6">Quelqu'un vient de tenter de créer un compte avec cette adresse, mais elle est déjà enregistrée et vérifiée. Tu peux simplement te connecter.</p>
       ${button(loginUrl, 'Me connecter')}`),
  });
}
