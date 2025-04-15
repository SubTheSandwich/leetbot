// index.js
const { ActivityType, Client, GatewayIntentBits, Partials, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SlashCommandBuilder, Routes, InteractionType, Colors, AttachmentBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { registerFont } = require('canvas');
require('dotenv').config();
const problemsData = JSON.parse(fs.readFileSync('problems.json'));

if (!fs.existsSync('userData')) fs.mkdirSync('userData');

registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVuSans' });

const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });

const commands = [
  new SlashCommandBuilder()
  .setName('compete')
  .setDescription('Get the link to the current problem the bot is competing in'),
  new SlashCommandBuilder().setName('leet').setDescription('Log a LeetCode problem'),
  new SlashCommandBuilder().setName('stats')
    .setDescription('View your LeetCode stats')
    .addStringOption(opt => opt.setName('date').setDescription('YYYY-MM-DD'))
    .addStringOption(opt =>
      opt
        .setName('range')
        .setDescription('Select a time range')
        .addChoices(
          { name: 'today', value: 'today' },
          { name: 'week', value: 'week' },
          { name: 'month', value: 'month' }
        )
    )
    .addUserOption(opt => opt.setName('user').setDescription("View another user's stats")),
  new SlashCommandBuilder().setName('chart')
    .setDescription('View a chart of your LeetCode progress')
    .addStringOption(opt =>
      opt
        .setName('range')
        .setDescription('week | month')
        .addChoices(
          { name: 'week', value: 'week' },
          { name: 'month', value: 'month' }
        )
    )
    .addUserOption(opt => opt.setName('user').setDescription("View another user's chart")),
  new SlashCommandBuilder().setName('leaderboard')
    .setDescription('View daily leaderboard'),
  new SlashCommandBuilder().setName('streak')
    .setDescription('View your solving streak')
    .addUserOption(opt => opt.setName('user').setDescription("View another user's streak")),
    new SlashCommandBuilder().setName('problems')
    .setDescription("View a breakdown of problems by difficulty")
    .addUserOption(opt => opt.setName('user').setDescription("View another user's breakdown")),
    new SlashCommandBuilder()
    .setName('random')
    .setDescription("Get a random unsolved problem")
    .addStringOption(opt =>
      opt.setName('difficulty')
        .setDescription('Select a difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'easy', value: 'easy' },
          { name: 'medium', value: 'medium' },
          { name: 'hard', value: 'hard' }
        )
    ),
  new SlashCommandBuilder().setName('profile')
    .setDescription("View your user profile")
    .addUserOption(opt => opt.setName('user').setDescription("View another user's profile")),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
})();

function getUserData(userId) {
  const filePath = path.join('userData', `${userId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath));
}

function updateStatus(client, problemsData) {
  const nonPremium = problemsData.stat_status_pairs.filter(p => !p.paid_only);
  const random = nonPremium[Math.floor(Math.random() * nonPremium.length)];
  const id = random.stat.frontend_question_id;

  client.user.setActivity(`Problem #${id}`, {
    type: ActivityType.Competing
  });
}

function saveUserData(userId, data) {
  const filePath = path.join('userData', `${userId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function fetchProblemInfoById(id) {
  const match = problemsData.stat_status_pairs.find(p => String(p.stat.frontend_question_id) === String(id));
  if (!match) return null;
  return {
    id: match.stat.frontend_question_id,
    title: match.stat.question__title,
    slug: match.stat.question__title_slug,
    difficulty: match.difficulty.level,
  };
}

function calculateStreak(data) {
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (data[dateStr] && data[dateStr].length > 0) streak++;
    else break;
  }
  return streak;
}

function getDifficultyLabel(level) {
  return level === 1 ? 'Easy' : level === 2 ? 'Medium' : 'Hard';
}

function sendError(interaction, message) {
  const embed = new EmbedBuilder()
    .setTitle('❌ Error')
    .setDescription(message)
    .setColor(Colors.DarkRed);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = interaction.commandName;
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;
    const userData = getUserData(userId);
    const today = new Date().toISOString().slice(0, 10);
    if (command === 'compete') {
      const activity = client.user.presence?.activities?.find(a => a.type === ActivityType.Competing);
      
      if (!activity || !activity.name.startsWith('Problem #')) {
        return sendError(interaction, "The bot is not currently competing on any problem");
      }
    
      const match = activity.name.match(/Problem #(\d+)/);
      const problemId = match?.[1];
    
      if (!problemId) {
        return sendError(interaction, "Could not determine the problem ID");
      }
    
      const problem = problemsData.stat_status_pairs.find(
        p => String(p.stat.frontend_question_id) === problemId
      );
    
      if (!problem) {
        return sendError(interaction, "Problem not found in database");
      }
    
      const title = problem.stat.question__title;
      const id = problem.stat.frontend_question_id
      const slug = problem.stat.question__title_slug;
      const url = `https://leetcode.com/problems/${slug}/`;
    
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🏁 Current Compete Problem`)
            .setDescription(`[Problem #${id}: ${title}](${url})`)
            .setColor(Colors.LightGrey)
        ]
      });
    }
    if (command === 'problems') {
      if (!userData) return sendError(interaction, `No data found for <@${userId}>.`);
      const counts = { Easy: 0, Medium: 0, Hard: 0 };
      Object.values(userData).flat().forEach(entry => {
        const info = fetchProblemInfoById(entry.problemId);
        if (info) counts[getDifficultyLabel(info.difficulty)]++;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📚 Problem Breakdown for ${targetUser.username}`)
        .addFields(
          { name: 'Easy', value: `${counts.Easy}`, inline: true },
          { name: 'Medium', value: `${counts.Medium}`, inline: true },
          { name: 'Hard', value: `${counts.Hard}`, inline: true },
        )
        .setColor(Colors.Aqua);
      return interaction.reply({ embeds: [embed] });
    }

    if (command === 'random') {
      const difficulty = interaction.options.getString('difficulty');
      const solved = new Set(Object.values(userData || {}).flat().map(e => e.problemId));
      const pool = problemsData.stat_status_pairs.filter(p => !solved.has(String(p.stat.frontend_question_id)) && !p.paid_only);
      const filtered = difficulty ? pool.filter(p => getDifficultyLabel(p.difficulty.level).toLowerCase() === difficulty.toLowerCase()) : pool;

      if (!filtered.length) {
        return interaction.reply({ embeds: [
          new EmbedBuilder().setTitle('❌ No problems found').setDescription(`You may have solved them all!`).setColor(Colors.DarkRed)
        ], ephemeral: true });
      }
      const rand = filtered[Math.floor(Math.random() * filtered.length)];
      const url = `https://leetcode.com/problems/${rand.stat.question__title_slug}/`;
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('🎲 Random Problem').setDescription(`[Problem #${rand.stat.frontend_question_id}: ${rand.stat.question__title}](${url})`).setColor(Colors.Orange)
      ] });
    }

    if (command === 'profile') {
      if (!userData) return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('❌ No data').setDescription(`No data found for <@${userId}>.`).setColor(Colors.DarkRed)
      ], ephemeral: true });

      const allEntries = Object.entries(userData).sort();
      const firstDate = allEntries[0]?.[0];
      const totalProblems = allEntries.reduce((sum, [, entries]) => sum + entries.length, 0);
      const totalTime = allEntries.reduce((sum, [, entries]) => sum + entries.reduce((s, e) => s + Number(e.timeTaken), 0), 0);
      const avgTime = totalProblems ? (totalTime / totalProblems).toFixed(1) : 0;
      const streak = calculateStreak(userData);

      const embed = new EmbedBuilder()
        .setTitle(`👤 Profile: ${targetUser.username}`)
        .addFields(
          { name: 'First Log', value: firstDate || 'N/A', inline: true },
          { name: 'Total Problems', value: `${totalProblems}`, inline: true },
          { name: 'Avg Time/Problem', value: `${avgTime} min`, inline: true },
          { name: 'Current Streak', value: `${streak} day(s)`, inline: true },
        )
        .setColor(Colors.Blurple);

      return interaction.reply({ embeds: [embed] });
    }
    if (command === 'leet') {
      const modal = new ModalBuilder().setCustomId('leetModal').setTitle('Log LeetCode Problem');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('problemId').setLabel('Problem ID').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('timeTaken').setLabel('Time Taken (minutes)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('lookedUp').setLabel('Looked up solution? (yes/no)').setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
    }

    if (command === 'stats') {
      if (!userData) return sendError(interaction, `No data found for <@${userId}>.`);

      const date = interaction.options.getString('date') || null;
      const range = interaction.options.getString('range') || 'today';
      const now = new Date();

      if (range === 'today' || date) {
        const key = date || today;
        if (!(key in userData)) return sendError(interaction, `No data for ${targetUser.username} on ${key}.`);

        const stats = userData[key] || [];
        const totalTime = stats.reduce((s, e) => s + Number(e.timeTaken), 0);
        const embed = new EmbedBuilder()
          .setTitle(`📊 Stats for ${targetUser.username} on ${key}`)
          .addFields(
            { name: 'Problems Solved', value: `${stats.length}`, inline: true },
            { name: 'Total Time', value: `${totalTime} minutes`, inline: true }
          )
          .setColor(Colors.Blue);
        return interaction.reply({ embeds: [embed] });
      } else if (range === 'month') {
        let totalProblems = 0;
        let totalTime = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(now.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const stats = userData[dateStr] || [];
          totalProblems += stats.length;
          totalTime += stats.reduce((s, e) => s + Number(e.timeTaken), 0);
        }
        const embed = new EmbedBuilder()
          .setTitle(`📊 Monthly Stats for ${targetUser.username}`)
          .addFields(
            { name: 'Total Problems Solved (30 days)', value: `${totalProblems}`, inline: true },
            { name: 'Total Time Spent', value: `${totalTime} minutes`, inline: true }
          )
          .setColor(Colors.Purple);
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (command === 'chart') {
      if (!userData) return sendError(interaction, `No data found for <@${userId}>.`);

      const range = interaction.options.getString('range') || 'week';
      const days = range === 'week' ? 7 : 30;
      const labels = [], stats = [];

      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        labels.unshift(dateStr);
        const entries = userData[dateStr] || [];
        stats.unshift({ date: dateStr, problems: entries.length, time: entries.reduce((s, e) => s + Number(e.timeTaken), 0) });
      }

      const canvas = new ChartJSNodeCanvas({ width: 600, height: 300, backgroundColour: 'white' });
      const image = await canvas.renderToBuffer({
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Problems Solved',
              data: stats.map(s => s.problems),
              backgroundColor: 'rgb(75,192,192)',
              borderColor: 'black',
              borderWidth: 1
            },
            {
              label: 'Total Time (min)',
              data: stats.map(s => s.time),
              backgroundColor: 'rgb(153,102,255)',
              borderColor: 'black',
              borderWidth: 1
            },
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: {
              labels: {
                color: 'black'
              }
            }
          },
          scales: {
            x: {
              ticks: { color: 'black' },
              grid: { color: 'black' }
            },
            y: {
              ticks: { color: 'black' },
              grid: { color: 'black' }
            }
          }
        }
      });

      const chartAttachment = new AttachmentBuilder(image, { name: `${range}_stats.png` });
      const embed = new EmbedBuilder()
        .setTitle(`📈 ${range.charAt(0).toUpperCase() + range.slice(1)} Stats for ${targetUser.username}`)
        .setColor(Colors.Green);

      await interaction.reply({ embeds: [embed], files: [chartAttachment] });
    }

    if (command === 'leaderboard') {
      const files = fs.readdirSync('userData');
      const today = new Date().toISOString().slice(0, 10);
      const scores = files.map(file => {
        const id = file.replace('.json', '');
        const data = getUserData(id);
        const count = data[today]?.length || 0;
        return { id, count };
      }).filter(u => u.count > 0).sort((a, b) => b.count - a.count);

      if (scores.length === 0) return sendError(interaction, `No data for today yet.`);

      const embed = new EmbedBuilder()
        .setTitle('🏆 Daily Leaderboard')
        .setColor(Colors.Gold)
        .setDescription(scores.map((s, i) => `**${i + 1}.** <@${s.id}> - ${s.count} ${s.count === 1 ? 'problem' : 'problems'}`).join('\n'));

      return interaction.reply({ embeds: [embed] });
    }

    if (command === 'streak') {
      if (!userData) return sendError(interaction, `No data found for <@${userId}>.`);
      const streak = calculateStreak(userData);
      const embed = new EmbedBuilder()
        .setTitle('🔥 Solving Streak')
        .setDescription(`${targetUser.username}'s current streak: **${streak}** day(s)!`)
        .setColor(Colors.Gold);
      return interaction.reply({ embeds: [embed] });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'leetModal') {
    const userId = interaction.user.id;
    const id = interaction.fields.getTextInputValue('problemId').trim();
    const time = interaction.fields.getTextInputValue('timeTaken').trim();
    const lookedUp = interaction.fields.getTextInputValue('lookedUp').trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const userData = getUserData(userId) || {};
    userData[today] = userData[today] || [];
    if (userData[today].some(e => e.problemId === id)) {
      return interaction.reply({ content: `❌ You already logged problem #${id} today.`, ephemeral: true });
    }

    const problemInfo = await fetchProblemInfoById(id);
    if (!problemInfo) return interaction.reply({ content: `❌ Problem ID ${id} not found.`, ephemeral: true });

    userData[today].push({
      problemId: id,
      title: problemInfo.title,
      slug: problemInfo.slug,
      timeTaken: time,
      lookedUp,
    });
    saveUserData(userId, userData);

    const embed = new EmbedBuilder()
      .setTitle(`Completed Problem #${id}. ${problemInfo.title}`)
      .setURL(`https://leetcode.com/problems/${problemInfo.slug}/`)
      .addFields(
        { name: 'Looked up Solution', value: lookedUp === 'yes' ? 'Yes' : 'No', inline: true },
        { name: 'Time Taken', value: `${time} minutes`, inline: true },
      )
      .setColor(lookedUp === 'yes' ? Colors.Red : Colors.Green);

    await interaction.reply({ embeds: [embed] });
  }
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  updateStatus(client, problemsData); 
  setInterval(() => updateStatus(client, problemsData), 5 * 60 * 1000); 
});

client.login(process.env.TOKEN);
