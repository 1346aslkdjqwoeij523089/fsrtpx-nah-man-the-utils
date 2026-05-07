const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

// ====== CONFIG (use environment variables) ======
const DISCORD_TOKEN = process.env.TOKEN; // required name: TOKEN
const GUILD_ID = '1499139848559132672';
const MEMBER_COUNT_CHANNEL_ID = '1499244464596848723';
const BOT_MENTION_ROLE_ID = '1500345067754360922';
const TICKET_CHANNEL_ID = '1499157124859564082';
const SAY_ROLE_IDS = new Set(['1499160401781330053', '1499160472753147986']);

// UptimeRobot (optional but requested)
const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_KEY; // set in Render env vars
const UPTIMEROBOT_MONITOR_ID = process.env.UPTIMEROBOT_MONITOR_ID; // set in Render env vars

// ===================================================

function formatMemberChannelName(nonBotMemberCount) {
  return `👥・Members・${nonBotMemberCount}`;
}

function normalizeContent(s) {
  return (s || '').trim();
}

async function updateMemberCount(client) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;

  // Count non-bots in the guild
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  const nonBots = members.filter((m) => !m.user?.bot);
  const desiredName = formatMemberChannelName(nonBots.size);

  const channel = await client.channels.fetch(MEMBER_COUNT_CHANNEL_ID).catch(() => null);
  if (!channel || typeof channel.setName !== 'function') return;

  // Only edit if needed
  if (channel.name !== desiredName) {
    await channel.setName(desiredName).catch(() => null);
  }
}

async function sendUptimeRobotHeartbeat() {
  if (!UPTIMEROBOT_API_KEY || !UPTIMEROBOT_MONITOR_ID) return;

  // UptimeRobot supports heartbeat by monitor id:
  // https://uptimerobot.com/api/v1/getMonitors? (and heartbeat endpoint documented)
  // Most commonly: https://api.uptimerobot.com/v2/getMonitors
  // but heartbeat is supported on v1 via /v1/heartbeat.
  // We'll call the v1 endpoint.
  const url = `https://api.uptimerobot.com/v1/heartbeat/${encodeURIComponent(UPTIMEROBOT_MONITOR_ID)}?apiKey=${encodeURIComponent(UPTIMEROBOT_API_KEY)}`;

  try {
    await fetch(url, { method: 'GET' });
  } catch {
    // ignore
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', async () => {
  // Presence: “night crescent” (Discord presence “LISTENING” can be approximated; exact imagery depends on client).
  // We'll set an activity string that matches the requested phrase.
  client.user.setPresence({
    activities: [{
      name: 'Florida State Roleplay | dsc.gg/flrpy',
      type: ActivityType.Listening,
    }],
    status: 'online',
  });

  await updateMemberCount(client);
  setInterval(() => updateMemberCount(client), 10 * 60 * 1000);
});

client.on('messageCreate', async (message) => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const contentRaw = message.content ?? '';

  // 1) Solely says: <@&BOT_ID>
  const solelyMention = normalizeContent(contentRaw) === `<@&${BOT_MENTION_ROLE_ID}>`;
  if (solelyMention) {
    await message.channel.send(
      `Hello! I am **FSRP Services** and I manage \`Florida State Roleplay (FLRPY).\`. If you have any questions regarding the operations of our server, please create a ticket in <#${TICKET_CHANNEL_ID}>.`
    );
    return;
  }

  // 2) Prefix handler for say
  // Prefix can be any casing / no space between ping and prefix.
  // We interpret prefix as: message starts with <@&BOT_ID> followed immediately by prefix keyword in any casing.
  // Example: <@&1500...>prefix =say hello
  // We'll allow formats:
  // - <@&BOT_ID>prefix
  // - <@&BOT_ID>prefix=something (not required)
  const contentNoSpace = contentRaw.replace(/\s+/g, '');
  const botPingRegex = new RegExp(`<@&${BOT_MENTION_ROLE_ID}>`, 'i');

  const startsWithPing = botPingRegex.test(contentNoSpace);
  if (!startsWithPing) return;

  // Remove the ping from the original content without altering inner spacing too much.
  const afterPing = contentNoSpace.replace(botPingRegex, '');

  // Determine the command word (case-insensitive), allowing no spaces.
  const lower = afterPing.toLowerCase();

  // Allowed: "prefix" command (any casing), with or without space: user may send <@&...> prefix
  // We'll handle when afterPing begins with "prefix".
  if (lower.startsWith('prefix')) {
    await message.channel.send('My prefix is `=`. All slash commands are alternatively available with the prefix.');
    return;
  }

  // Say command: =say or /say
  // Since our afterPing removed spaces, we need to parse original message too.
  // We'll use the full content, but stripped of leading/trailing whitespace.
  const normalizedFull = normalizeContent(contentRaw);

  const sayRegex = new RegExp(`^<@&${BOT_MENTION_ROLE_ID}>\\s*(?:=say\\b|/say\\b)([\\s\\S]*)$`, 'i');
  const mSay = normalizedFull.match(sayRegex);
  if (!mSay) return;

  const userHasRole = message.member?.roles?.cache?.some((r) => SAY_ROLE_IDS.has(r.id));
  if (!userHasRole) {
    // delete and do nothing else
    await message.delete().catch(() => null);
    return;
  }

  const toSay = (mSay[1] || '').trim();
  await message.delete().catch(() => null);
  if (toSay.length) {
    await message.channel.send(toSay);
  }
});

client.login(DISCORD_TOKEN);

// heartbeat helper on demand (Render can call this job endpoint externally if desired)
// If you want automatic regular heartbeat, uncomment:
// setInterval(() => sendUptimeRobotHeartbeat().catch(() => {}), 5 * 60 * 1000);

