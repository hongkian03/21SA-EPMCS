const axios = require('axios'), {MongoClient} = require('mongodb'),
    client = new MongoClient(process.env.MONGO_URI_GUNSM), db = client.db('e-logbook'),
    gunRecsFin = db.collection('hist'), gunRecsMut = db.collection('poli'),
    gunSts = db.collection('snap'), roles = db.collection('role'),
    token = process.env.BOT_TOKEN_GUNSM, b = `https://api.telegram.org/bot${token}`, chatID = -1001868636368,
    express = require('express'), tonicExpress = require('@runkit/runkit/express-endpoint/1.0.0'),
    app = tonicExpress(module.exports), bodyParser = require('body-parser@1.20.1'),
    a = 'https://untitled-q68a17wgxkv4.runkit.sh',
    CryptoJS = require('crypto-js'), pw = process.env.FORM_SECRET_GUNSM,
    ms = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split`|`, maxLen = 4096, // to store gun #
    meExists = (r, q) => {
        if (!r) throw {m: 'Your details are not with us. Please set your role using /setme.'};
        return Promise.all([r, gunSts.findOne(q)]);
    }, meScope = (r, haveNo) => {
        if (!r[1]) throw {m: `${haveNo ? `Gun ${no} not` : 'No guns'} found.`};
        let r0 = r[0], r1 = r[1];
        if (!('of' in r0)) return r0;
        if (haveNo && !r0.of.test(r1.of)) throw {m: `Sorry, permission is not granted to approve operations on \
this gun. Gun ${no} may belong to a battalion or battery to which you do not have access.`};
       return r0;
    }, rvRgxOf = inp => 'admin' in inp ? {} : {$expr: {$regexMatch: {input: inp.of, regex: '$of'}}},
    dStrCmpr = (a, b) => new Date(a.entry_date||a.threshold_date||0) - new Date(b.entry_date||b.threshold_date||0);
var no, flag, recs;
app.use(bodyParser.urlencoded({extended: !1}));

function decr(str) { return CryptoJS.AES.decrypt(str, pw).toString(CryptoJS.enc.Utf8); }

// escape md special characters except * for bold, ~ strikethrough, ` monospace
function mdEsc(x) { return x.replace(/([\\_{}\[\]<>()#+-.!|])/g, '\\$1'); }
function remMdSp(x) { return x.replace(/([\\_{}\[\]<>()#+-.!|*~])/g, ''); } // remove ALL md spec chs
function botSend(msg, s) { // if arg s (tg user id) present, will pm that 1 user instead of sending to chat
    return axios.post(`${b}/sendMessage`, {chat_id: s ? s : chatID, text: mdEsc(msg), parse_mode: 'MarkdownV2'});
}
function showStatus(msgID) { // update pinned msg w/ minimalist summary of gun snapshots
    let staStrs = {};
    return gunSts.find({_id: {$gte: 0}}).forEach(doc => {
        let staDetl = [], dOf = doc.of;
        for (let k in doc) {
            if (!~['_id', 'timestamp', 'of'].indexOf(k)) {
                if (k == 'FPT' || k == 'PMCS') doc[k] = doc[k] ? '✅' : '❌';
                staDetl.push(`${k} ${doc[k]}`);
            }
        }
        let ln = `${doc._id}: ${staDetl.join`, `}`;
        if (dOf in staStrs) staStrs[dOf].push(ln);
        else staStrs[dOf] = [ln];
    }).then(r => {
        let res = [];
        for (let num in staStrs) res.push(`*${num}*\n${staStrs[num].join`\n`}`);
        return axios.post(`${b}/editMessageText`, {chat_id: chatID, message_id: msgID,
            text: mdEsc(res.sort((a, b) => {
                let c = x => x.match(/^\*([^*]+)\*/)[1];
                return c(a).localeCompare(c(b), undefined, {numeric: !1, sensitivity: 'base'});
            }).join`\n`), parse_mode: 'MarkdownV2'});
    });
}

function r1f(s) { return roles.findOne({_id: s}); }
function getThresh(dateObj, scope) { // threshold in past according to quantitative scope
    let helper = (dO, sc) => {
        let m = dO.getMonth();
        if (typeof sc == 'number') return [m, dO.getDate() - sc];
        switch (sc) {
            case 'w': return [m, dO.getDate() - (dO.getDay() + 6) % 7];
            case 'm': return [m, 1];
            case 'q': return [m - m % 3, 1];
            case 'y': return [0, 1];
        }
    }, tz = dateObj.getTimezoneOffset();
    // normalise to start of day (in sg!)
    return new Date(Date.UTC(dateObj.getFullYear(), ...helper(dateObj, scope), tz/60|0 - 8, tz%60, 0, 0));
}
function getDefects(gun) {
    let arr = [], mtc;
    for (let k of Object.keys(gun)) if ((mtc = k.match(/abnormalfault_(\w+)/)) && gun[k] == 'Yes') arr.push(mtc[1]);
    return arr;
}
function strfyRec(sn, gun) { // stringify doc from hist col
    let action = gun.action_performed, de = getDefects(gun),
        extra = ~['Monthly', 'Weekly', 'Yearly'].indexOf(action) ?
            `|${de.length ? `defects: ${de.join`, `}` : 'no abnormality/fault'}` :
            (action == 'HOTO GUN' ? `|${gun.handing_over_unitbattery}|${gun.taking_over_unitbattery}` : '');
    return `${sn}|${gun.metadata.gun_number}|${
        'threshold_date' in gun ? `${action}|threshold ${gun.threshold_date}` :
            `${gun.entry_date}|${action}|${'liters' in gun ? `${gun.liters} L` : gun.final_engine_hour + extra}`}`;
}
function showRecords(s, ly) {
    recs = recs.filter(e => !('void' in e)).sort(dStrCmpr);
    if (!recs.length) throw {m: 'No logs found. Please provide data.'};
    let msgs = [], temp = [], red = arr => arr.join`\n`.length,
        pushTrunc = () => msgs.push(temp.join`\n`.slice(0, maxLen));
    if (ly) recs = recs.filter(e => 'action_performed' in e && e.action_performed == ly);
    for (let i = 0; i < recs.length; i++) {
        let rec = strfyRec(i + 1, recs[i]);
        if (red(temp.concat(rec)) > maxLen) {
            pushTrunc();
            temp = [];
        }
        temp.push(rec);
    }
    if (temp) pushTrunc();
    return msgs.length < 2 ? botSend(msgs[0], s) : buildThenCh(...msgs.map(e => botSend(e, s)));
}
/* function checkNRIC(x) {
    x = x.toUpperCase();
    if (/^([STFG]X{4})?\d{3}[ABCDEFGHIZJKLMNPQRTUWX]$/.test(x)) return !0;
    else if (!/^([ST]\d{7}[ABCDEFGHIZJ]|[FG]\d{7}[KLMNPQRTUWX])$/.test(x))
        return !1;
    let pre = x[0], che = x[8], weights = [2, 7, 6, 5, 4, 3, 2],
        d = x.slice(1, 8).split``.map((e, i) => e * weights[i])
            .reduce((a, b) => a + b, /S|F/.test(pre) ? 0 : 4) % 11;
    return che == (/S|T/.test(pre) ? 'JZIHGFEDBCA' : 'XWUTRQPNMLK')[d];
} */
// ddmmyy, d[d]SEPm[m]SEPy[y[y[y]]] or d[d][SEP]m[m][SEP]y[y[y[y]]] to dd Mmm yyyy, exclude if parse fails
function parseSkipd(arr) {
    let s = `[!"#$%&'*,-./;?@]`, n = (str, sep) => new RegExp(`^(\\d{1,2})${sep}${str}${sep}(\\d{1,4})$`, 'i'),
        rgxStrm = /^(\d\d)(\d\d)(\d\d)$/, rgxNoL = n('(\\d+)', s), rgxL = n(`(${ms.join`|`})[a-z]*`, `${s}?`);
    return arr.map(e => {
        let f;
        return [(f = 0, e.match(rgxStrm)) || (f = 1, e.match(rgxNoL)) || (f = 2, e.match(rgxL)), f];
    }).filter(e => e[0]).map(e => {
        let res, e0 = e[0], fmtDmy = x => {
            let e01 = e0[1], e03 = e0[3];
            return `${e01.length > 1 ? e01 : ('0' + e01).slice(-2)} ${x} ${e03.length > 3 ? e03 : `${2000- -e03}`}`;
        }, m = ms[e0[2] - 1], invD = e0[1] > 31, invDOrM = invD || m == void 0;
        switch (e[1]) {
            case 0: return invDOrM ? null : `${e0[1]} ${m} 20${e0[3]}`;
            case 1: return invDOrM ? null : fmtDmy(m);
            case 2: return invD ? null : fmtDmy(e0[2].replace(/./g, (e, i) => e[`to${i ? 'Low' : 'Upp'}erCase`]()));
        }
    }).filter(e => e);
}
function editKb(chID, msgID, btns) {
    return axios.post(`${b}/editMessageReplyMarkup`, {chat_id: chID, message_id: msgID,
        reply_markup: {inline_keyboard: [btns]}});
}
function btnThing(s, whichOp, d, nDone) {
    let newND, q;
    return buildThenCh(r1f(s), r => {
        if (!nDone && !r)
            throw {m: 'Your details are not with us. Please set your role using /setme (click for help).'};
        q = {action_performed: whichOp[0].toUpperCase() + whichOp.slice(1)};
        let gunsInScope = gunSts.find('admin' in r ? {} : {of: {$regex: r.of.source}}).toArray();
        if (!nDone || !~nDone) return gunsInScope;
        d = getThresh(d, whichOp[0]);
        let acknowlog = {id: d, metadata: {gun_number: nDone}, user: 'Admin', admin: 'admin' in r ? s: r.appt,
                threshold_date: d.toLocaleDateString('en-GB', {timeZone: 'Asia/Singapore'})
                    .replace(/\/(\d\d)\//, (a, b) => ` ${ms[b-1]} `), action_performed: `Approve ${whichOp}`};
        return gunSts.findOne({_id: -1}).then(r => {
            let rand = ~~(Math.random() * 901) + 100;
            acknowlog.resNum = r.resNum + rand;
            return Promise.all([gunsInScope, gunRecsFin.insertOne(acknowlog), gunRecsMut.insertOne(acknowlog),
                botSend(`Approval of ${whichOp} PMCS for gun ${nDone} added to records.`, s)]);
        });
    }, r => gunRecsMut.find({'metadata.gun_number': nDone ? {$gt: nDone, $in: r[0].map(e => e._id)} :
        {$in: r.map(e => e._id)}}).sort({'metadata.gun_number': 1}).toArray(),
    docs => {
        if (!docs.length) throw {m: 'Response ended.'};
        newND = docs[0].metadata.gun_number;
        recs = docs.filter((e, i, a) => e.metadata.gun_number == newND);
        return showRecords(s);
    }, r => {
        r = r.data.result.message_id;
        return editKb(s, r, [{text: 'OK', callback_data: `${s} ${r} ${whichOp} ${newND}`},
            {text: 'HOLD', callback_data: `${s} ${r} ${whichOp} -1`}]);
    });
}
function getResNum(args, d, s) {
    let isAdmin, sn, /*nric,*/ targetRec;
    return buildThenCh(r1f(s), r => {
        if (!r) throw {m: 'Your details are not with us. Please set your role using /setme (click for help).'};
        if (!args.length) throw {m: `Requires serial number counting from 30 days ago.`};
        if (!/\d+/.test(sn = args[0])) throw {m: `Could not recognise ${sn} as a number.`};
        sn = +sn.match(/\d+/)[0];
        d = getThresh(d, 30);
        let result = gunRecsMut.find({id: {$gte: d}}).forEach(e => !('void' in e) ? recs.push(e) : 0);
        if ('admin' in r) {
            isAdmin = !0;
            // return result;
        }
        // if (args.length < 2 || !checkNRIC(nric = args[1]))
        //     throw {m: 'Please enter a valid NRIC. Masked value is accepted.'};
        return result;
    }, r => {
        recs.sort(dStrCmpr);
        if (!isAdmin) recs = recs/*.filter(e => nric.slice(-4) == decr(e.nric).slice(-4))*/;
        if (!recs.length || recs.length < sn) throw {m: 'S/n out of range.'};
        targetRec = recs[sn - 1];
        return botSend(strfyRec(sn, targetRec)/*.slice(0, maxLen)*/, s);
    }, r => botSend(`The following submission number can be used either as an amendment ID on FormSG or with the \
bot command \`/void\`: ${'resNum' in targetRec ? `\`${targetRec.resNum}\`` : 'n/a'}`, s));
}
function buildThenCh(...prs) { // chain
    if (prs.length < 2) return Promise.resolve((() => { console.log('not enough arguments to buildThenCh()'); })());
    let res = prs[0], oth = prs.slice(1);
    if (typeof res.then != 'function') res = Promise.resolve().then(res);
    for (let pr of oth) res = res.then(pr);
    return res;
}
function customPrCh(cmd, args, d, s) { // customise promise chain based on bot cmd
    switch (cmd) {
        case '/start': return botSend(`I recognise the following commands:\n\
/getme to retrieve the sender's role according to his/her Telegram ID\n\
/setme to set this role\n\
/setgunorg to initialise the organisational affiliation of a single gun\n\
/viewgun to view logs a given number of days ago for a single gun\n\
/weekly to approve/acknowledge weekly PMCS\n\
/monthly, monthly\n\
/quarterly, quarterly\n\
/yearly, yearly\n\
/viewmut to view logs the sender is allowed to amend or void (cut-off 30 days ago)\n\
/reqn to get a unique number (counting from the cut-off) that may be used to identify a resubmission on FormSG \
or to \`/void\` a log through me\n\
/void to reverse an operation safely using the log number I provide under \`/reqn\`\n\
/getskip to retrieve discrete occasions when FPT or PMCS may be skipped\n\
/addskip to add some such\n\
/cancelskip, remove\n\
Please PM me to get started.\n\n\
*@GUNSM_bot* is a work in progress. \`2023-01-16T17:15+08\``, s);
        // retrieve by tg user id from roles
        case '/getme': return buildThenCh(r1f(s), r => {
                if (!r) throw {m: 'Role not found with your Telegram ID. You may wish to /setme (click for help).'};
                return botSend('admin' in r ? 'You are an admin.' : `Role found with your Telegram ID:\nUsername \
${r.n}\nOrganisation ${r.of.toString().replace(/[^\w()]/g, '')}\nAppointment ${r.appt}`, s);
            });
        // create role, or change >=1 fields in existing
        case '/setme':
            let f, g, h, count;
            return buildThenCh(() => {
                if (!args.length) throw {m: `Some input is missing. Please provide \`name\` as the username the \
bot will associate with you, \`org\` your affiliation, \`appt\` your appointment\n\
Correctly formatted example: \`/setme name=PTE CHUA BOON HOW org=21SA(B) appt=GUN IC\``};
                g = args.join` `.replace(/ *= */g,'=').match(/[^= ]+=([^=](?![^= ]+=))+/g)
                    .map(e => e.split`=`.map((f, i) => (i ? f.toUpperCase() : f.toLowerCase()).trim()));
                [f, h, count] = [{}, {name: 'n', org: 'of', appt: 'appt'}, 0];
                for (let e of g) {
                    if (e[0] in h) {
                        count++;
                        f[h[e[0]]] = e[1];
                    }
                }
                if (!count) throw {m: 'No valid data fields detected.'};
            }, r => r1f(s), r => {
                if (!r && count < 3) throw {m: `None of your details are with us yet. Please provide all 3 \
fields to create a role.`};
                let of = f.of, appt;
                if (!/^[A-Z]+$|^[A-Z\d]+(\([A-Z]+\))$/.test(of)) throw {m: 'Could not recognise org value.'};
                else f.of = ~of.indexOf(')') ? of : `21SA\(${of}\)`;
                if (!/^(GUN IC|SM|BC|HQSM)$/.test(appt = f.appt))
                    throw {m: 'Could not recognise appt value. Options `GUN IC` · `SM` · `BC` · `HQSM`'};
                f.of = new RegExp(`^${appt == 'HQSM' ? f.of.replace(/\(.+\)/, '') :
                    `${f.of.replace(/(\(|\))/g,'\\$1')}$`}`);
                return roles.updateOne({_id: s}, {$set: f}, {upsert: !0});
            }, r => botSend('Role successfully set with your Telegram ID.', s));
        // init org affiliation of single gun
        case '/setgunorg':
            let of;
            return buildThenCh(() => {
                let fail = `Please follow \`<gun #> <intended affiliation>\` format, eg \`${cmd} 1234 B\` \
(default unit is 21SA) or \`${cmd} 4321 23SA(A)\``;
                if (!args.length) throw {m: fail};
                if (!/^\d+ .+/.test(args.join` `)) throw {m: fail};
                of = args[1].toUpperCase();
                if (!/^[A-Z]+$|^[A-Z\d]+(\([A-Z]+\))$/.test(of)) throw {m: fail};
                if (!~of.indexOf(')')) of = `21SA(${of})`;
            }, r => r1f(s), r => {
                if (!r) throw {m: 'Please set your role using /setme (click for help).'};
                no = +args[0];
                return gunSts.findOne({_id: no});
            }, r => {
                if (r) throw {m: '/setgunorg cannot apply to a gun already in the database.'};
                return gunSts.insertOne({_id: no, of: of, FPT: !1, PMCS: !1, hours: 'n/a'});
            }, r => showStatus(388),
            r => botSend(`Gun ${no} has been added under ${of}. Please check pinned message listing statuses of \
guns.`));
        // view logs for single gun today & given number of days ago
        case '/viewgun':
            recs = [];
            return buildThenCh(() => {
                let fail = `Please follow \`<gun> <days>\` format, eg \`${cmd} 2645 37\``;
                if (!args.length) throw {m: fail};
                if (!/^\d+ \d+( |$)/.test(args.join` `)) throw {m: fail};
                no = +args[0];
                return r1f(s);
            }, r => meExists(r, {_id: no}), r => meScope(r, !0), r => {
                d = getThresh(d, +args[1]);
                return gunRecsMut.find({id: {$gte: d}, 'metadata.gun_number': no}).forEach(e => recs.push(e));
            }, r => showRecords(s));
        // show logs on x-ly basis for gun-by-gun approval
        case '/weekly':
        case '/monthly':
        case '/quarterly':
        case '/yearly': return btnThing(s, cmd.slice(1), d);
        // view logs back to limit of bot-based mutability 30 d ago
        case '/viewmut':
        case '/viewmutable':
            recs = [];
            let qME = obj => 'admin' in obj ? {} : {of: {$regex: obj.of.source}};
            return buildThenCh(r1f(s), r => meExists(r, qME(r)), r => meScope(r, !1), r => {
                d = getThresh(d, 30);
                return gunRecsMut.find({id: {$gte: d}}).forEach(e => recs.push(e));
            }, r => showRecords(s));
        // pass rec sn counting from 30 d ago to get resNum for editing or voiding
        case '/reqn':
            recs = [];
            return getResNum(args, d, s);
        case '/void': // WIP!
            let num/*, nric*/;
            return buildThenCh(r1f(s), r => {
                if (!r)
                    throw {m: 'Your details are not with us. Please set your role using /setme (click for help).'};
                if (!args.length) throw {m: 'Requires FormSG submission number.'};
                if (!/^\d{10,}$/.test(num = args[0])) throw {m: `Could not recognise ${num} as a number.`};
                let result = gunRecsMut.findOne({resNum: +num});
                if ('admin' in r) {
                    isAdmin = !0;
                    // return result;
                }
                // if (args.length < 2 || !checkNRIC(nric = args[1]))
                //     throw {m: 'Please enter a valid NRIC. Masked value is accepted.'};
                return result;
            }, r => {
                let op = r.action_performed,
                    prs = [gunRecsMut.updateOne({resNum: +num}, {$set: {void: d}})], boolVoid = {};
                switch (op) {
                    case 'Weekly':
                    case 'Monthly':
                    case 'Yearly': boolVoid.PMCS = !1;
                    case 'FPT':
                        boolVoid.FPT = !1;
                }
                console.log(boolVoid);
                for (let k in boolVoid) {
                    prs.push(gunSts.updateOne({_id: +r.metadata.gun_number}, {$set: boolVoid, $inc: {hours: -.3}}));
                    break;
                }
                console.log(prs.length);
                return Promise.all(prs);
            }, r => Promise.all([showStatus(388), botSend('\`/void\` success.', s)]));
        // retrieve discrete occasions when fpt/pmcs may be skipped universally
        case '/getskip': return buildThenCh(() => gunSts.findOne({_id: -1}), r => {
                let sk = r.skips, rFPT = sk.fpt, rPMCS = sk.pmcs, f = a => a.length ? `\n${a.join`\n`}` : ' n/a';
                [rFPT, rPMCS, sk] = [f(rFPT), f(rPMCS), '(the whole week containing each date will be skipped)'];
                return botSend(`*FPT*:${rFPT}\n*PMCS* ${sk}:${rPMCS}`, s);
            });
        case '/addskip': // must specify
        case '/cancelskip': // must specify
        case '/clearskip': // empties relevant array. keep out of pinned option list for now
            let valid, skB, whOp, q = {}, doc = {}, x = cmd[1] == 'a', y = cmd != '/clearskip';
            return buildThenCh(() => {
                if (!args.length) throw {m: `Requires indication of \`FPT\` or \`PMCS\`${y ? ` followed by one or \
more dates (day, month, year), eg \`${cmd} fpt 010224 030425\`, \`${cmd} pmcs 080224\`. If PMCS, the whole week \
containing each date indicated will ${x ? 'be skipp' : 'have its existing skip status cancell'}ed (Mon the 5th to \
Fri the 9th in the above example); please proceed only if this is correct` : `, ie \`${cmd} fpt\` or \`${cmd} \
pmcs\`. Please proceed only if you wish to remove all existing skips for the given operation type`}.`};
                [whOp, ...args] = args;
                if (!/fpt|pmcs/i.test(whOp = remMdSp(whOp))) throw {m: `${whOp} is not a valid operation type.`};
                [valid, d] = [parseSkipd(args), new Date(d.getFullYear(), d.getMonth(), d.getDate())];
                skB = valid.map(e => new Date(e) >= d);
                if (y && !skB.length) throw {m: valid.length ? `Dates recognised: ${valid.join`\n`}\nNo update \
will be made as all values antedate today.` : 'Could not detect any date.'};
                let vldFltrd = valid.filter((e, i) => skB[i]);
                q[`skips.${whOp.toLowerCase()}`] = x ? {$each: vldFltrd} : (y ? {$in: vldFltrd} : []);
                doc[`$${x ? 'addToSet' : (y ? 'pull' : 'set')}`] = q;
                return botSend(`Dates recognised:\n${y ? `${valid.map((e, i) => skB[i] ? `${e}^` : e).join`\n`}\n\
Values equal to today or later are marked with a \`^\`.` : `n/a (removing all ${whOp.toUpperCase()} skips)`}`, s);
            }, r => gunSts.updateOne({_id: -1}, doc), r => botSend(`\`${cmd}\` done.`, s));
        default: return Promise.resolve().then(() => {throw {m: 'Bot command not recognised.'};});
    }
}

app.post('/telegram',
    express.json(),
    (req, res) => {
        const bod = req.body, resOK = () => res.sendStatus(200);
        if (!('message' in bod)) { // eg edited
            if (!('callback_query' in bod)) return resOK();
            // handle press of approve button via reply mark-up. disables after 1st event
            let clbkData = bod.callback_query.data;
            if (clbkData == '!') return resOK();
            let docs = [], chID = +(clbkData = clbkData.split` `)[0], cdn = +clbkData[3];
            return editKb(chID, +clbkData[1], [{text: ~cdn ? 'DONE' : 'ON HOLD', callback_data: '!'}])
                .then(r => btnThing(chID, clbkData[2], new Date(), cdn))
                .catch(e => 'm' in e ? botSend(e.m, chID) : console.error(e)).finally(resOK);
        }
        const bm = bod.message;
        if (!('text' in bm)) return resOK(); // eg leaving
        const sender_id = bm.from.id, d = new Date(bm.date * 1e3), bmt = bm.text.trim().replace(/\s\s+/g, ' ');
        if (!bmt.startsWith('/')) return resOK();
        let slashCmd, additional;
        [slashCmd, ...additional] = bmt.split` `;
        return customPrCh(slashCmd.toLowerCase(), additional, d, sender_id)
            .catch(e => 'm' in e ? botSend(e.m, sender_id) : console.error(e))
            .finally(resOK);
    });
