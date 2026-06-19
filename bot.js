// STRATOS AI Telegram Bot - Updated
// Deploy on Railway.app
// Required env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════
const BOT_TOKEN    = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT         = process.env.PORT || 3000;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars! Set BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
  process.exit(1);
}

const CHANNEL_ID      = '@stratosAi_official';
const TWITTER_URL     = 'https://x.com/stratosaig';
const WEBSITE_URL     = 'https://stratosai.net';
const SPORTSBOOK_URL  = 'https://stratosai.bet';

// Points
const POINTS = {
  join_channel:    200,
  follow_twitter:  200,
  visit_website:   100,
  referral:        300,
  // Platform events (via webhook)
  visit_sportsbook: 250,
  connect_wallet:   300,
  place_bet:        400,
  winning_bet:      500,
};

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Track pending Twitter verifications (telegramId -> timestamp)
const pendingTwitter = new Map();

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function genRefCode(telegramId) {
  return 'STRAT' + telegramId.toString(36).toUpperCase();
}

async function getOrCreateUser(msg) {
  const tid = msg.from ? msg.from.id : msg.id;
  const username = msg.from ? msg.from.username : msg.username || null;
  const firstName = msg.from ? msg.from.first_name : msg.first_name || 'User';

  let { data: user } = await supabase
    .from('users').select('*').eq('telegram_id', tid).single();

  if (!user) {
    const refCode = genRefCode(tid);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ telegram_id: tid, username, first_name: firstName, referral_code: refCode, points: 0 })
      .select('*').single();
    if (error) console.error('Insert error:', error);
    user = newUser || { telegram_id: tid, first_name: firstName, username, points: 0, referral_code: refCode };
  }

  if (user && (user.username !== username || user.first_name !== firstName)) {
    await supabase.from('users').update({ username, first_name: firstName }).eq('telegram_id', tid);
  }

  return user;
}

async function addPoints(telegramId, pts, eventName) {
  const { data: user } = await supabase.from('users').select('points').eq('telegram_id', telegramId).single();
  if (user) {
    await supabase.from('users').update({ points: user.points + pts }).eq('telegram_id', telegramId);
    if (eventName) {
      console.log(`[Points] +${pts} to ${telegramId} for ${eventName}`);
    }
  }
}

async function checkAlreadyDone(telegramId, taskField) {
  const { data: user } = await supabase.from('users').select(taskField).eq('telegram_id', telegramId).single();
  return user && user[taskField] === true;
}

// ═══════════════════════════════════════
// /start
// ═══════════════════════════════════════
bot.onText(/\/start(.*)/, async (msg, match) => {
  const user = await getOrCreateUser(msg);
  const refParam = match[1].trim();

  if (refParam && !user.referred_by) {
    const { data: referrer } = await supabase.from('users').select('*').eq('referral_code', refParam).single();
    if (referrer && referrer.telegram_id !== msg.from.id) {
      await supabase.from('users').update({ referred_by: referrer.telegram_id }).eq('telegram_id', msg.from.id);
      await supabase.from('referrals').insert({ referrer_id: referrer.telegram_id, referred_id: msg.from.id });
      await addPoints(referrer.telegram_id, POINTS.referral, 'referral');
      bot.sendMessage(referrer.telegram_id, `🎉 New referral! *+${POINTS.referral} $STRAT points*\n\nKeep sharing your link!`, { parse_mode: 'Markdown' });
    }
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '🌐 Main Site', url: WEBSITE_URL }, { text: '🎯 Sportsbook', url: SPORTSBOOK_URL }],
      [{ text: '📢 Telegram Channel', url: 'https://t.me/stratosAi_official' }, { text: '🐦 Twitter / X', url: TWITTER_URL }],
      [{ text: '✅ Tasks & Earn Points', callback_data: 'tasks' }],
      [{ text: '👤 My Profile', callback_data: 'profile' }, { text: '🏆 Leaderboard', callback_data: 'leaderboard' }],
      [{ text: '👥 Refer & Earn', callback_data: 'referral' }],
    ]
  };

  bot.sendMessage(msg.chat.id,
    `🚀 *Welcome to STRATOS AI, ${user.first_name}!*\n\n` +
    `The World's First Decentralized Sports Oracle.\n\n` +
    `⚡ AI-powered match predictions\n` +
    `🎯 Real-time odds & analysis\n` +
    `💎 Earn $STRAT points for tasks\n` +
    `🔜 Presale launching Q4 2026\n\n` +
    `Complete tasks below to earn points and secure your airdrop allocation!`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ═══════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════
async function showProfile(chatId, telegramId) {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
  if (!user) return;
  const { count: refCount } = await supabase.from('referrals').select('*', { count: 'exact' }).eq('referrer_id', telegramId);
  const { data: rank } = await supabase.from('leaderboard').select('rank').eq('telegram_id', telegramId).single();

  bot.sendMessage(chatId,
    `👤 *Your Profile*\n\n` +
    `👋 Name: ${user.first_name}\n` +
    `💎 Points: *${user.points} $STRAT*\n` +
    `🏆 Rank: *#${rank?.rank || 'N/A'}*\n` +
    `👥 Referrals: *${refCount || 0}*\n` +
    `💼 Wallet: ${user.wallet_address ? '`' + user.wallet_address.slice(0,6) + '...' + user.wallet_address.slice(-4) + '`' : 'Not connected'}\n\n` +
    `🔑 Referral code: \`${user.referral_code}\``,
    { parse_mode: 'Markdown' }
  );
}

// ═══════════════════════════════════════
// TASKS
// ═══════════════════════════════════════
async function showTasks(chatId, telegramId) {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
  if (!user) return;

  const keyboard = {
    inline_keyboard: [
      // Social tasks
      [{
        text: user.task_joined_channel ? `✅ Joined Channel (+${POINTS.join_channel})` : `📣 Join Channel (+${POINTS.join_channel} pts)`,
        callback_data: user.task_joined_channel ? 'already_done' : 'task_channel'
      }],
      [{
        text: user.task_followed_twitter ? `✅ Following Twitter (+${POINTS.follow_twitter})` : `🐦 Following Twitter (+${POINTS.follow_twitter} pts)`,
        callback_data: user.task_followed_twitter ? 'already_done' : 'task_twitter'
      }],
      [{
        text: user.task_visited_website ? `✅ Visited Website (+${POINTS.visit_website})` : `🌐 Visit Website (+${POINTS.visit_website} pts)`,
        callback_data: user.task_visited_website ? 'already_done' : 'task_website'
      }],
      // Platform events
      [{ text: '─── Platform Events ───', callback_data: 'noop' }],
      [{
        text: user.task_visit_sportsbook ? `✅ StratosAI.bet (+${POINTS.visit_sportsbook})` : `🎯 StratosAI.bet (+${POINTS.visit_sportsbook} pts)`,
        callback_data: user.task_visit_sportsbook ? 'already_done' : 'noop'
      }],
      [{
        text: user.task_connect_wallet ? `✅ Connect Wallet (+${POINTS.connect_wallet})` : `💼 Connect Wallet (+${POINTS.connect_wallet} pts)`,
        callback_data: user.task_connect_wallet ? 'already_done' : 'noop'
      }],
      [{
        text: user.task_place_bet ? `✅ Place Bet (+${POINTS.place_bet})` : `🎰 Place Bet (+${POINTS.place_bet} pts)`,
        callback_data: user.task_place_bet ? 'already_done' : 'noop'
      }],
      [{
        text: user.task_winning_bet ? `✅ Winning Bet (+${POINTS.winning_bet})` : `🏆 Winning Bet (+${POINTS.winning_bet} pts)`,
        callback_data: user.task_winning_bet ? 'already_done' : 'noop'
      }],
      [{ text: '🔙 Back', callback_data: 'back_home' }],
    ]
  };

  const totalEarned =
    (user.task_joined_channel   ? POINTS.join_channel    : 0) +
    (user.task_followed_twitter ? POINTS.follow_twitter  : 0) +
    (user.task_visited_website  ? POINTS.visit_website   : 0) +
    (user.task_visit_sportsbook ? POINTS.visit_sportsbook: 0) +
    (user.task_connect_wallet   ? POINTS.connect_wallet  : 0) +
    (user.task_place_bet        ? POINTS.place_bet       : 0) +
    (user.task_winning_bet      ? POINTS.winning_bet     : 0);

  bot.sendMessage(chatId,
    `✅ *Tasks & Earn Points*\n\n` +
    `Complete tasks to earn $STRAT for the airdrop!\n\n` +
    `📱 *Social Tasks* — do them now\n` +
    `🎯 *Platform Events* — happen automatically when you use StratosAI.bet\n\n` +
    `💎 Earned from tasks: *${totalEarned} pts*\n` +
    `💎 Total points: *${user.points} pts*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// ═══════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════
async function showLeaderboard(chatId) {
  const { data: users } = await supabase.from('leaderboard').select('*').limit(20);
  if (!users || !users.length) { bot.sendMessage(chatId, '🏆 Leaderboard is empty. Be the first!'); return; }

  const medals = ['🥇', '🥈', '🥉'];
  const list = users.map((u, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const name = u.username ? `@${u.username}` : u.first_name || 'Anonymous';
    return `${medal} ${name} — *${u.points} pts*`;
  }).join('\n');

  bot.sendMessage(chatId,
    `🏆 *STRATOS AI Leaderboard*\n\n${list}\n\n_Complete tasks & refer friends to climb the ranks!_`,
    { parse_mode: 'Markdown' }
  );
}

// ═══════════════════════════════════════
// REFERRAL
// ═══════════════════════════════════════
async function showReferral(chatId, telegramId) {
  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
  if (!user) return;
  const refLink = `https://t.me/StratosAidrop_Bot?start=${user.referral_code}`;
  const { count } = await supabase.from('referrals').select('*', { count: 'exact' }).eq('referrer_id', telegramId);

  bot.sendMessage(chatId,
    `👥 *Refer & Earn*\n\n` +
    `Invite friends and earn *${POINTS.referral} $STRAT points* per referral!\n\n` +
    `🔗 Your referral link:\n\`${refLink}\`\n\n` +
    `👥 Total referrals: *${count || 0}*\n` +
    `💎 Earned from referrals: *${(count || 0) * POINTS.referral} pts*\n\n` +
    `_Share your link to maximize your airdrop allocation!_`,
    { parse_mode: 'Markdown' }
  );
}

// ═══════════════════════════════════════
// CALLBACK QUERIES
// ═══════════════════════════════════════
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id;
  const data = query.data;

  bot.answerCallbackQuery(query.id);
  await getOrCreateUser(query);

  switch(data) {

    case 'noop': break;

    case 'profile':      showProfile(chatId, telegramId);   break;
    case 'tasks':        showTasks(chatId, telegramId);      break;
    case 'leaderboard':  showLeaderboard(chatId);            break;
    case 'referral':     showReferral(chatId, telegramId);   break;

    case 'already_done':
      bot.sendMessage(chatId, '✅ You already completed this task!');
      break;

    // ── JOIN CHANNEL ──
    case 'task_channel':
      bot.sendMessage(chatId,
        `📣 *Join our Telegram Channel*\n\nJoin then click "I Joined" to claim your points!`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '📣 Join Channel', url: 'https://t.me/stratosAi_official' },
            { text: `✅ I Joined! Claim +${POINTS.join_channel} pts`, callback_data: 'verify_channel' }
          ]]}
        }
      );
      break;

    case 'verify_channel':
      // Anti-spam: check not already done
      if (await checkAlreadyDone(telegramId, 'task_joined_channel')) {
        bot.sendMessage(chatId, '✅ Already claimed!'); break;
      }
      try {
        const member = await bot.getChatMember('@stratosAi_official', telegramId);
        if (['member','administrator','creator'].includes(member.status)) {
          await supabase.from('users').update({ task_joined_channel: true }).eq('telegram_id', telegramId);
          await addPoints(telegramId, POINTS.join_channel, 'join_channel');
          bot.sendMessage(chatId, `✅ *Verified! +${POINTS.join_channel} $STRAT points added!*\n\nKeep completing tasks to earn more!`, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, '❌ You haven\'t joined yet. Please join the channel first!');
        }
      } catch(e) {
        // Benefit of doubt
        await supabase.from('users').update({ task_joined_channel: true }).eq('telegram_id', telegramId);
        await addPoints(telegramId, POINTS.join_channel, 'join_channel');
        bot.sendMessage(chatId, `✅ *+${POINTS.join_channel} $STRAT points added!*`, { parse_mode: 'Markdown' });
      }
      break;

    // ── FOLLOW TWITTER — 10s Lazy Verification ──
    case 'task_twitter':
      bot.sendMessage(chatId,
        `🐦 *Follow us on Twitter/X*\n\nFollow @stratosaig then click "I Followed" to claim your points!\n\n_A 10-second verification timer will run to confirm._`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '🐦 Follow on X', url: TWITTER_URL },
            { text: `✅ I Followed! Claim +${POINTS.follow_twitter} pts`, callback_data: 'verify_twitter' }
          ]]}
        }
      );
      break;

    case 'verify_twitter':
      if (await checkAlreadyDone(telegramId, 'task_followed_twitter')) {
        bot.sendMessage(chatId, '✅ Already claimed!'); break;
      }
      // Set pending with timestamp
      pendingTwitter.set(telegramId, Date.now());
      bot.sendMessage(chatId, '⏳ Verifying your follow... please wait 10 seconds.');
      // 10-second lazy verification
      setTimeout(async () => {
        const pending = pendingTwitter.get(telegramId);
        if (!pending) return;
        pendingTwitter.delete(telegramId);
        // Check still not done (anti-double-claim)
        if (await checkAlreadyDone(telegramId, 'task_followed_twitter')) return;
        await supabase.from('users').update({ task_followed_twitter: true }).eq('telegram_id', telegramId);
        await addPoints(telegramId, POINTS.follow_twitter, 'follow_twitter');
        bot.sendMessage(chatId, `✅ *Verified! +${POINTS.follow_twitter} $STRAT points added!*\n\nThank you for following @stratosaig!`, { parse_mode: 'Markdown' });
      }, 10000);
      break;

    // ── VISIT WEBSITE ──
    case 'task_website':
      bot.sendMessage(chatId,
        `🌐 *Visit STRATOS AI*\n\nVisit our website and sportsbook, then claim your points!`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [
            [{ text: '🌐 Visit Main Site', url: WEBSITE_URL }, { text: '🎯 Open Sportsbook', url: SPORTSBOOK_URL }],
            [{ text: `✅ I Visited! Claim +${POINTS.visit_website} pts`, callback_data: 'verify_website' }]
          ]}
        }
      );
      break;

    case 'verify_website':
      if (await checkAlreadyDone(telegramId, 'task_visited_website')) {
        bot.sendMessage(chatId, '✅ Already claimed!'); break;
      }
      await supabase.from('users').update({ task_visited_website: true }).eq('telegram_id', telegramId);
      await addPoints(telegramId, POINTS.visit_website, 'visit_website');
      bot.sendMessage(chatId, `✅ *+${POINTS.visit_website} $STRAT points added!*`, { parse_mode: 'Markdown' });
      break;

    case 'back_home':
      bot.sendMessage(chatId, 'Use /start to return to the main menu.');
      break;
  }
});

// ═══════════════════════════════════════
// WEBHOOK SERVER — Platform Events
// POST /webhook with JSON: { telegramId, eventType }
// eventType: visit_sportsbook | connect_wallet | place_bet | winning_bet
// ═══════════════════════════════════════
const EVENT_CONFIG = {
  visit_sportsbook: { points: POINTS.visit_sportsbook, field: 'task_visit_sportsbook',  label: 'StratosAI.bet',    emoji: '🎯' },
  connect_wallet:   { points: POINTS.connect_wallet,   field: 'task_connect_wallet',    label: 'Connect Wallet',  emoji: '💼' },
  place_bet:        { points: POINTS.place_bet,         field: 'task_place_bet',         label: 'Place Bet',       emoji: '🎰' },
  winning_bet:      { points: POINTS.winning_bet,       field: 'task_winning_bet',       label: 'Winning Bet',     emoji: '🏆' },
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404); res.end('Not found'); return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { telegramId, eventType } = JSON.parse(body);
      if (!telegramId || !eventType) { res.writeHead(400); res.end('Missing fields'); return; }

      const cfg = EVENT_CONFIG[eventType];
      if (!cfg) { res.writeHead(400); res.end('Unknown event'); return; }

      // Check not already claimed
      const { data: user } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();
      if (!user) { res.writeHead(404); res.end('User not found'); return; }
      if (user[cfg.field]) { res.writeHead(200); res.end(JSON.stringify({ status: 'already_done' })); return; }

      // Award points
      await supabase.from('users').update({ [cfg.field]: true }).eq('telegram_id', telegramId);
      await addPoints(telegramId, cfg.points, eventType);

      // Notify user in Telegram
      bot.sendMessage(telegramId,
        `${cfg.emoji} *+${cfg.points} $STRAT points!*\n\n` +
        `Task completed: *${cfg.label}*\n\n` +
        `Keep using STRATOS AI to earn more points! 🚀`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});

      res.writeHead(200); res.end(JSON.stringify({ status: 'ok', points: cfg.points }));
    } catch(e) {
      console.error('Webhook error:', e);
      res.writeHead(500); res.end('Server error');
    }
  });
});

server.listen(PORT, () => console.log(`🌐 Webhook server running on port ${PORT}`));

// ═══════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════
bot.on('polling_error', (error) => console.error('Polling error:', error.message));
console.log('🚀 STRATOS AI Bot is running...');
