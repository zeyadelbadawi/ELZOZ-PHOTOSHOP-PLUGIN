// Every message the bot sends to customers (Egyptian Arabic). Edit wording here.

import { formatDate, formatMoney } from "./util.mjs";

export const MENU_ROWS = [
    { id: "prices", title: "💰 الأسعار والباقات", description: "شوف الباقات واختار" },
    { id: "buy", title: "🛒 اشترك أو جدد", description: "اطلب باقة وادفع بانستاباي أو فودافون كاش" },
    { id: "faq", title: "❓ أسئلة شائعة" },
    { id: "install", title: "🛠️ مساعدة في التثبيت" },
    { id: "forgot", title: "🔑 نسيت الباسورد" },
    { id: "human", title: "👤 كلم الدعم" }
];

export const T = {
    welcome: (name) =>
        `أهلاً${name ? " يا " + name : ""} 👋\nده بوت *Elzoz*: بلجن فوتوشوب بيحوّل شيت إكسل + تمبلت PSD لمئات التصميمات والفيديوهات في دقايق.\nاختار من القائمة 👇`,
    welcomeBack: (name, account) =>
        account && account.available != null
            ? `أهلاً بيك تاني${name ? " يا " + name : ""} 👋\nرصيدك: *${account.available}* كريدت${account.next_expiry ? `، أقرب انتهاء ${formatDate(account.next_expiry)}` : ""}.\nتحب تعمل إيه؟`
            : `أهلاً بيك تاني${name ? " يا " + name : ""} 👋 تحب تعمل إيه؟`,
    menuBody: "اختار من القائمة 👇",
    menuLabel: "القائمة",
    prices: (packages) =>
        "💰 *الباقات:*\n\n" +
        packages.map((p) => `• *${p.name}*: ${p.price_egp} جنيه — ${p.credits} كريدت لمدة ${p.valid_days} يوم`).join("\n") +
        "\n\nكل تصميم ناجح = 1 كريدت، والتصميم اللي يفشل مش بيتحسب.",
    choosePackage: "اختار الباقة 👇",
    choosePackageLabel: "الباقات",
    renewAsk: (email) => `هتجدد على حسابك *${email}*؟`,
    askEmail: "ابعتلي الإيميل اللي هتسجل بيه دخول البلجن 📧",
    emailAgain: "مش لاقي إيميل في رسالتك 🤔 ابعته كده: name@gmail.com",
    confirmEmail: (email) => `الإيميل: *${email}*\nمظبوط؟`,
    payment: (order, s) =>
        `🧾 طلب رقم *${order.code}*\nالباقة: ${order.package_name}\n\n` +
        `حوّل *${formatMoney(order.amount_due)} جنيه بالظبط* (المبلغ ده مخصوص لطلبك عشان نأكده تلقائي)\n\n` +
        `• InstaPay: *${s.instapay_address}*\n• فودافون كاش: *${s.vodafone_cash_number}*\n\n` +
        `وبعد التحويل ابعت *سكرين شوت* هنا 📸\nالطلب صالح ${s.order_ttl_hours || 24} ساعة. ولو عايز تلغيه اكتب: إلغاء`,
    amountMismatch: (seen, due) =>
        `⚠️ المبلغ في الصورة ${formatMoney(seen)} جنيه، والمطلوب *${formatMoney(due)}*. لو حولت مبلغ مختلف، متقلقش، هنراجعه يدوي.`,
    claimReceived: "📸 استلمنا الإيصال، وبنتأكد من التحويل. هيوصلك تأكيد هنا أول ما يتأكد ✅",
    askScreenshot: "ابعت سكرين شوت التحويل هنا 📸 عشان نأكده.",
    noOpenOrder: "مفيش طلب مفتوح ليك دلوقتي. لو عايز تشترك اختار من القائمة 👇",
    orderCancelled: (code) => `اتلغى الطلب ${code} ✅`,
    tooManyOrders: "عملت طلبات كتير النهارده. استنى شوية أو كلم الدعم.",
    busy: "في ضغط دلوقتي على الطلبات، هنكمل معاك يدوي حالاً 🙏",
    orderExpired: (code) => `⏰ مهلة الطلب ${code} خلصت. لو كنت حولت، ابعت الإيصال هنا وهنراجعه.`,
    rejected: (code) => `❌ مقدرناش نأكد التحويل للطلب ${code}. لو فيه غلط، كلمنا وهنراجعه.`,
    newAccount: (o, email, password, link, s, account) =>
        `🎉 *تم تفعيل اشتراكك!*\n\n` +
        `📧 الإيميل: ${email}\n🔑 الباسورد: ${password}\n` +
        `💳 الرصيد: ${account?.available ?? o.credits} كريدت — صالح لحد ${formatDate(account?.next_expiry)}\n\n` +
        `⬇️ تحميل البلجن: ${link || "(هنبعتلك الملف حالاً)"}\n🎬 خطوات التثبيت: ${s.install_url}\n\n` +
        `1) دبل كليك على ملف .ccx → هيتثبت من Creative Cloud\n2) افتح فوتوشوب → Plugins → Elzoz\n3) سجل دخول بالإيميل والباسورد\n\nاحتفظ بالرسالة دي. ولو احتجت أي حاجة اكتب: القائمة`,
    renewed: (o, account) =>
        `✅ *تم شحن حسابك!*\n+${o.credits} كريدت (طلب ${o.code})\n💳 رصيدك دلوقتي: ${account?.available ?? "-"} كريدت\n⏳ أقرب انتهاء: ${formatDate(account?.next_expiry)}\n\nشكراً إنك معانا 🙏`,
    referral: (credits) => `🎁 حد اشترك بكود الترشيح بتاعك! اتضاف لحسابك ${credits} كريدت هدية. شكراً 🙏`,
    refCode: (code) => `\n\n🎁 كود الترشيح بتاعك: *REF-${code}*\nأي حد يشترك بيه ياخد حسابك كريدت هدية. ابعتله اللينك ده وخليه يكتب الكود في أول رسالة.`,
    passwordReset: (email, password) => `🔑 الباسورد الجديد لحسابك ${email}:\n*${password}*\n\nاحتفظ بيه في مكان آمن.`,
    passwordNoAccount: "الرقم ده مش مربوط بحساب عندنا. هنحولك للدعم يتأكدوا منك 👤",
    passwordWait: "لسه عاملين باسورد جديد من شوية. استنى 10 دقايق وجرب تاني.",
    install: (s) =>
        `🛠️ *التثبيت:*\n1) لازم Photoshop 2023 (23.3) أو أحدث + تطبيق Creative Cloud\n2) دبل كليك على ملف .ccx واقبل التثبيت\n3) افتح فوتوشوب → Plugins → Elzoz\n4) سجل دخول\n\n🎬 فيديو: ${s.install_url}\n\nاتحلت؟`,
    installOk: "تمام 🎉 لو احتجت أي حاجة اكتب: القائمة",
    faqIntro: "اختار السؤال 👇",
    faqLabel: "الأسئلة",
    human: (s, inHours) =>
        `👤 تمام، حد من الدعم هيرد عليك ${s.reply_sla || "قريب"}.` +
        (inHours ? "" : `\nمواعيدنا من ${s.work_hours?.start ?? 10} لـ ${s.work_hours?.end ?? 22}، وهنرد أول ما نبدأ.`) +
        "\nاكتب رسالتك وهتوصل لينا.",
    paused: (s) => `أهلاً 👋 هنرد عليك ${s.reply_sla || "قريب"} 🙏`,
    thanks: "العفو 🙏 لو احتجت أي حاجة اكتب: القائمة",
    notImage: "لو ده إيصال تحويل، اطلب الأول باقة من القائمة وبعدين ابعته 🙏",
    unsupported: "مقدرش أقرا النوع ده من الرسايل 🙈 اكتبلي نص أو اختار من القائمة.",
    demo: (s) => `🎬 شوف البلجن بيشتغل إزاي: ${s.demo_url}`
};

export function inWorkHours(hour, s) {
    const start = Number(s.work_hours?.start ?? 10);
    const end = Number(s.work_hours?.end ?? 22);
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}
