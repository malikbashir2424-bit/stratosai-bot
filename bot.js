// STRATOS AI Telegram Bot
// Deploy on Railway.app or any Node.js server
// Required env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════
const BOT_TOKEN    = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if(!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY){
  console.error('Missing environment variables! Set BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
  process.exit(1);
}

const CHANNEL_ID      = '@stratosAi_official';
const TWITTER_URL     = 'https://x.com/stratosaig';
const WEBSITE_URL     = 'https://stratosa.netlify.app';
const PREDICTIONS_URL = 'https://stratosa.netlify.app/predictions';

// Points per task
const POINTS = {
  join_channel:    100,
  follow_twitter:  100,
  visit_website:    50,
  referral:        200,
};

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

// Generate unique referral code
function genRefCode(telegramId) {
  return 'STRAT' + telegramId.toString(36).toUpperCase();
}

// Get or create user
async function getOrCreateUser(msg) {
  const tid = msg.from ? msg.from.id : msg.id;
  const username = msg.from ? msg.from.username : msg.username || null;
  const firstName = msg.from ? msg.from.first_name : msg.first_name || 'User';

  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', tid)
    .single();

  if (!user) {
    const refCode = genRefCode(tid);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        telegram_id: tid,
        username,
        first_name: firstName,
        referral_code: refCode,
        points: 0,
      })
      .select('*')
      .single();
    
    if(error) console.error('Insert error:', error);
    user = newUser || { telegram_id: tid, first_name: firstName, username, points: 0, referral_code: refCode };
  }

  // Update name/username if changed
  if (user && (user.username !== username || user.first_name !== firstName)) {
    await supabase.from('users').update({ username, first_name: firstName }).eq('telegram_id', tid);
    user.username = username;
    user.first_name = firstName;
  }

  return user;
}

// Add points to user
async function addPoints(telegramId, pts) {
  const { data: user } = await supabase
    .from('users')
    .select('points')
    .eq('telegram_id', telegramId)
    .single();

  if (user) {
    await supabase
      .from('users')
      .update({ points: user.points + pts })
      .eq('telegram_id', telegramId);
  }
}

// ═══════════════════════════════════════
// /start
// ═══════════════════════════════════════
bot.onText(/\/start(.*)/, async (msg, match) => {
  const user = await getOrCreateUser(msg);
  const refParam = match[1].trim();

  // Handle referral
  if (refParam && !user.referred_by) {
    const { data: referrer } = await supabase
      .from('users')
      .select('*')
      .eq('referral_code', refParam)
      .single();

    if (referrer && referrer.telegram_id !== msg.from.id) {
      await supabase.from('users').update({ referred_by: referrer.telegram_id }).eq('telegram_id', msg.from.id);
      await supabase.from('referrals').insert({ referrer_id: referrer.telegram_id, referred_id: msg.from.id });
      await addPoints(referrer.telegram_id, POINTS.referral);
      bot.sendMessage(referrer.telegram_id, `🎉 New referral! +${POINTS.referral} $STRAT points`);
    }
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '🌐 Website', url: WEBSITE_URL }, { text: '⚽ Live Predictions', url: PREDICTIONS_URL }],
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
    `Complete tasks below to earn points and secure your spot in the airdrop!`,
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
    `🆔 ID: \`${user.telegram_id}\`\n` +
    `👋 Name: ${user.first_name}\n` +
    `💎 Points: *${user.points} $STRAT*\n` +
    `🏆 Rank: *#${rank?.rank || 'N/A'}*\n` +
    `👥 Referrals: *${refCount || 0}*\n` +
    `💼 Wallet: ${user.wallet_address ? '`' + user.wallet_address.slice(0,6) + '...' + user.wallet_address.slice(-4) + '`' : 'Not connected *(Coming Soon)*'}\n\n` +
    `🔑 Your referral code: \`${user.referral_code}\``,
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
      [{
        text: user.task_joined_channel ? '✅ Joined Channel (+100)' : '📢 Join Channel (+100 pts)',
        callback_data: user.task_joined_channel ? 'already_done' : 'task_channel'
      }],
      [{
        text: user.task_followed_twitter ? '✅ Following Twitter (+100)' : '🐦 Follow Twitter (+100 pts)',
        callback_data: user.task_followed_twitter ? 'already_done' : 'task_twitter'
      }],
      [{
        text: user.task_visited_website ? '✅ Visited Website (+50)' : '🌐 Visit Website (+50 pts)',
        callback_data: user.task_visited_website ? 'already_done' : 'task_website'
      }],
      [{ text: '🔙 Back', callback_data: 'back_home' }],
    ]
  };

  const totalEarned = (user.task_joined_channel ? POINTS.join_channel : 0) +
                      (user.task_followed_twitter ? POINTS.follow_twitter : 0) +
                      (user.task_visited_website ? POINTS.visit_website : 0);

  bot.sendMessage(chatId,
    `✅ *Tasks & Earn Points*\n\n` +
    `Complete tasks to earn $STRAT points for the airdrop!\n\n` +
    `💎 Total from tasks: *${totalEarned} pts*\n` +
    `💎 Your total points: *${user.points} pts*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
}

// ═══════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════
async function showLeaderboard(chatId) {
  const { data: users } = await supabase
    .from('leaderboard')
    .select('*')
    .limit(20);

  if (!users || !users.length) {
    bot.sendMessage(chatId, '🏆 Leaderboard is empty. Be the first!');
    return;
  }

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

  const refLink = `https://t.me/StratosAirdropbot?start=${user.referral_code}`;
  const { count } = await supabase.from('referrals').select('*', { count: 'exact' }).eq('referrer_id', telegramId);

  bot.sendMessage(chatId,
    `👥 *Refer & Earn*\n\n` +
    `Invite friends and earn *${POINTS.referral} $STRAT points* per referral!\n\n` +
    `🔗 Your referral link:\n\`${refLink}\`\n\n` +
    `👥 Total referrals: *${count || 0}*\n` +
    `💎 Earned from referrals: *${(count || 0) * POINTS.referral} pts*\n\n` +
    `_Share your link on social media to maximize your airdrop allocation!_`,
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
    case 'profile':
      showProfile(chatId, telegramId);
      break;

    case 'tasks':
      showTasks(chatId, telegramId);
      break;

    case 'leaderboard':
      showLeaderboard(chatId);
      break;

    case 'referral':
      showReferral(chatId, telegramId);
      break;

    case 'already_done':
      bot.sendMessage(chatId, '✅ You already completed this task!');
      break;

    case 'task_channel':
      bot.sendMessage(chatId,
        `📢 *Join our Telegram Channel*\n\nJoin here: ${CHANNEL_ID}\n\nAfter joining, click the button below to claim your points!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📢 Join Channel', url: 'https://t.me/stratosAi_official' },
              { text: '✅ I Joined! Claim +100 pts', callback_data: 'verify_channel' }
            ]]
          }
        }
      );
      break;

    case 'verify_channel':
      try {
        const member = await bot.getChatMember('@stratosAi_official', telegramId);
        if (['member','administrator','creator'].includes(member.status)) {
          await supabase.from('users').update({ task_joined_channel: true }).eq('telegram_id', telegramId);
          await addPoints(telegramId, POINTS.join_channel);
          bot.sendMessage(chatId, `✅ *Verified! +${POINTS.join_channel} $STRAT points added!*`, { parse_mode: 'Markdown' });
        } else {
          bot.sendMessage(chatId, '❌ You haven\'t joined yet. Please join the channel first!');
        }
      } catch(e) {
        // If can't verify, give benefit of doubt for demo
        await supabase.from('users').update({ task_joined_channel: true }).eq('telegram_id', telegramId);
        await addPoints(telegramId, POINTS.join_channel);
        bot.sendMessage(chatId, `✅ *+${POINTS.join_channel} $STRAT points added!*`, { parse_mode: 'Markdown' });
      }
      break;

    case 'task_twitter':
      bot.sendMessage(chatId,
        `🐦 *Follow us on Twitter/X*\n\nFollow: ${TWITTER_URL}\n\nAfter following, click below to claim your points!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🐦 Follow on X', url: TWITTER_URL },
              { text: '✅ I Followed! Claim +100 pts', callback_data: 'verify_twitter' }
            ]]
          }
        }
      );
      break;

    case 'verify_twitter':
      await supabase.from('users').update({ task_followed_twitter: true }).eq('telegram_id', telegramId);
      await addPoints(telegramId, POINTS.follow_twitter);
      bot.sendMessage(chatId, `✅ *+${POINTS.follow_twitter} $STRAT points added!*`, { parse_mode: 'Markdown' });
      break;

    case 'task_website':
      bot.sendMessage(chatId,
        `🌐 *Visit our Website & Try Predictions*\n\nVisit: ${PREDICTIONS_URL}\n\nTry the AI predictions, then claim your points!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🌐 Visit Website', url: WEBSITE_URL },
              { text: '⚽ Try Predictions', url: PREDICTIONS_URL }
            ],[
              { text: '✅ I Visited! Claim +50 pts', callback_data: 'verify_website' }
            ]]
          }
        }
      );
      break;

    case 'verify_website':
      await supabase.from('users').update({ task_visited_website: true }).eq('telegram_id', telegramId);
      await addPoints(telegramId, POINTS.visit_website);
      bot.sendMessage(chatId, `✅ *+${POINTS.visit_website} $STRAT points added!*`, { parse_mode: 'Markdown' });
      break;

    case 'back_home':
      bot.sendMessage(chatId, 'Use /start to go back to the main menu.');
      break;
  }
});

// ═══════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

console.log('🚀 STRATOS AI Bot is running...');
