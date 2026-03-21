const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, ModalBuilder, ActionRowBuilder,
  TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, MessageFlags,
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

// ──────────────────────────────────────────────
// CONFIGURAÇÃO
// ──────────────────────────────────────────────
const TOKEN    = process.env.DISCORD_TOKEN;
const GUILD_ID = "1482896148502020206";

const LOGO_URL   = "https://cdn.discordapp.com/attachments/1482886716393001052/1484316968772304976/RJFCQ35-removebg-preview.png?ex=69bdc966&is=69bc77e6&hm=6954fecdcfae88d6c370a96f2297b539e092be7ed015b2e1ff2548c5a7c8933d&";
const REGRAS_IMG = "https://cdn.discordapp.com/attachments/1483577134206160977/1484355094630895626/content.png?ex=69bdece8&is=69bc9b68&hm=507e43d5d3da932f3f7f6eef09d99f8380faf7e9f5d284a902492cbac5612719&";

const CARGOS_SUPORTE     = ["1483576832585367572","1483576833600393317","1483576834544369794"];
const CATEGORIA_TICKETS  = "1483980064910606386";
const CANAL_LOGS_AVAL    = "1484560745919414354";
const MANAGER_ROLE_ID    = "1483576846233764042";
const CANAL_CONTRATOS_ID = "1483577088568201408";
const CARGOS_TIMES       = [
  "1484546866233344111","1484546933115715636","1484546961184129024","1484546994797023313",
  "1484547020260905130","1484547051889885356","1484547078624514131","1484547111264456797",
];
const CONTRACT_EXPIRY_H = 24;
const DB_FILE           = path.join(__dirname, "contracts.json");
const LINK_BLOQUEADO    = /https?:\/\/(www\.)?roblox\.com\/share\?code=/i;

const CV2 = 1 << 15; // IsComponentsV2
const EPH = 1 << 6;  // Ephemeral

const CATEGORIAS = {
  duvidas:     { label: "Dúvidas",    description: "Perguntas gerais sobre a liga ou o servidor.", emoji: "🤔" },
  parcerias:   { label: "Parcerias",   description: "Propostas de parceria e divulgações.",         emoji: "🤝" },
  denuncias:   { label: "Denúncias",   description: "Denunciar algum usuário do servidor.",         emoji: "🚨" },
  ownar_clube: { label: "Ownar Clube", description: "Solicitar ownership de um clube.",             emoji: "🏆" },
  outros:      { label: "Outros",      description: "Outros assuntos não listados acima.",          emoji: "📌" },
};

const ticketsAssumidos = new Map();

// ──────────────────────────────────────────────
// BANCO DE DADOS
// ──────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { contracts: {}, history: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function gerarContractId(sId, cId) { return `WSA${sId}_${cId}_${Date.now()}`; }

// ──────────────────────────────────────────────
// COMPONENTS V2 — 100% raw JSON (sem builders)
// ──────────────────────────────────────────────
const txt       = (content)           => ({ type: 10, content });
const sep       = ()                  => ({ type: 14, divider: true, spacing: 1 });
const thumb     = (url)               => ({ type: 11, items: [{ media: { url } }] });
const container = (comps, color=0xFF6600) => ({ type: 17, accent_color: color, components: comps });

// Botões raw JSON
const btn = (customId, label, style) => ({
  type: 2, custom_id: customId, label, style,
  // style: 1=Primary 2=Secondary 3=Success 4=Danger
});

// ActionRow raw JSON
const row = (...components) => ({ type: 1, components });

// Select menu raw JSON
const selectMenu = (customId, placeholder, options) => ({
  type: 1,
  components: [{
    type: 3, custom_id: customId, placeholder, min_values: 1, max_values: 1, options,
  }],
});

const opt = (label, value, description, emoji) => ({ label, value, description, emoji: { name: emoji } });

// ── Rows prontos
const rowBotoesTicket   = () => row(
  btn("btn_fechar_ticket", "🔒 Fechar Ticket", 4),
  btn("btn_painel_membro", "👤 Painel Membro", 2),
  btn("btn_painel_staff",  "👮 Painel Staff",  2),
);
const rowBotoesContrato = () => row(
  btn("btn_aceitar_contrato", "✅  Aceitar", 3),
  btn("btn_recusar_contrato", "❌  Recusar", 4),
);
const rowDropdownTicket = () => selectMenu("ticket_select", "Selecione uma opção:", [
  opt("Dúvidas",    "duvidas",     "Perguntas gerais sobre a liga ou o servidor.", "🤔"),
  opt("Parcerias",   "parcerias",   "Propostas de parceria e divulgações.",         "🤝"),
  opt("Denúncias",   "denuncias",   "Denunciar algum usuário do servidor.",         "🚨"),
  opt("Ownar Clube", "ownar_clube", "Solicitar ownership de um clube.",             "🏆"),
  opt("Outros",      "outros",      "Outros assuntos não listados acima.",          "📌"),
]);
const rowDropdownMembro = () => selectMenu("painel_membro_select", "Selecione o que deseja fazer", [
  opt("Notificar Staff", "notificar_staff", "Envia um ping para quem está atendendo o ticket.", "🔔"),
]);
const rowDropdownStaff  = () => selectMenu("painel_staff_select", "Selecione o que deseja fazer", [
  opt("Notificar Membro", "notificar_membro", "Envia um ping para o membro no canal.", "📣"),
  opt("Assumir Ticket",   "assumir_ticket",   "Marca você como responsável por este ticket.", "✋"),
]);
const rowConfirmarTicket = (key) => row(
  btn(`confirmar_ticket:${key}`, "✅ Confirmar e Abrir Ticket", 3),
  btn("cancelar_ticket", "Cancelar", 4),
);
const rowAvaliacao = () => row(
  btn("aval_1", "⭐ 1", 4),
  btn("aval_2", "⭐ 2", 4),
  btn("aval_3", "⭐ 3", 2),
  btn("aval_4", "⭐ 4", 3),
  btn("aval_5", "⭐ 5", 3),
);

// ── Payloads
function payContratoPendente(c) {
  const issued  = new Date(c.created_at * 1000).toLocaleString("pt-BR");
  const expires = new Date(c.expires_at * 1000).toLocaleString("pt-BR");
  return {
    flags: CV2,
    components: [
      container([
        thumb(LOGO_URL),
        txt("## 📋 Proposta de Contrato — WSA League"),
        sep(),
        txt(`**Contratado:** <@${c.signee_id}> \`${c.signee_name}\`\n**Contratante:** <@${c.contractor_id}> \`${c.contractor_name}\`\n**Contract ID:** \`${c.contract_id}\`\n\n**Time:** ${c.team}\n**Posição:** ${c.position}\n**Cargo:** ${c.role}\n\n*Emitido: ${issued} • Expira: ${expires}*`),
      ]),
      rowBotoesContrato(),
    ],
  };
}
const payContratoAceito   = (c) => ({ flags: CV2, components: [container([txt(`## ✅ Contrato Aceito\n\n<@${c.signee_id}> aceitou e agora faz parte do time **${c.team}**!\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)], 0x2ECC71)] });
const payContratoRecusado = (c) => ({ flags: CV2, components: [container([txt(`## ❌ Contrato Recusado\n\n<@${c.signee_id}> recusou a proposta.\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)], 0x95A5A6)] });
const payContratoExpirado = (c) => ({ flags: CV2, components: [container([txt(`## ⏰ Contrato Expirado\n\nEste contrato expirou.\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)], 0x992D22)] });

function pegarDonoId(topic) {
  for (const part of (topic || "").split("|")) {
    const t = part.trim();
    if (t.startsWith("ID:")) { const id = t.replace("ID:", "").trim(); if (id) return id; }
  }
  return null;
}

// ──────────────────────────────────────────────
// CRIAR CANAL DE TICKET
// ──────────────────────────────────────────────
async function criarCanalTicket(interaction, categoriaKey) {
  const guild = interaction.guild;
  const cat   = CATEGORIAS[categoriaKey];
  const nome  = `${categoriaKey.replace("_","-")}-${interaction.user.username.toLowerCase().replace(/\s+/g,"-")}`;

  const existente = guild.channels.cache.find(c => c.name === nome);
  if (existente) { await interaction.followUp({ content: `❌ Você já tem um ticket em ${existente}!`, flags: EPH }); return; }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];
  for (const id of CARGOS_SUPORTE) {
    if (guild.roles.cache.has(id)) overwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const canal = await guild.channels.create({
    name: nome, type: 0,
    parent: guild.channels.cache.get(CATEGORIA_TICKETS) || null,
    permissionOverwrites: overwrites,
    topic: `Ticket de ${interaction.user.displayName} | Categoria: ${cat.label} | ID: ${interaction.user.id}`,
  });

  const mencoes = CARGOS_SUPORTE.map(id => `<@&${id}>`).join(" ");
  await canal.send({
    content: `<@${interaction.user.id}> ${mencoes}`,
    flags: CV2,
    components: [
      container([
        thumb(LOGO_URL),
        txt(`# ${cat.emoji} ${cat.label}\n\nOlá <@${interaction.user.id}>! A equipe de suporte irá te atender em breve.\n\n**Categoria:** ${cat.emoji} ${cat.label}\n**Descrição:** ${cat.description}\n\nDescreva sua situação com o máximo de detalhes possível.\n\n⏰ Horário de atendimento: **08:00 às 22:00**`),
      ]),
      rowBotoesTicket(),
    ],
  });

  await interaction.followUp({ content: `✅ Ticket aberto em ${canal}!`, flags: EPH });
}

// ──────────────────────────────────────────────
// SLASH COMMANDS
// ──────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("aviso").setDescription("📢 Envia um aviso oficial no canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true))
    .addStringOption(o => o.setName("descricao").setDescription("Descrição").setRequired(true))
    .addChannelOption(o => o.setName("canal").setDescription("Canal de destino").setRequired(false)),
  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Envia o painel de ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName("canal").setDescription("Canal de destino").setRequired(false)),
  new SlashCommandBuilder().setName("contratar").setDescription("📝 Envia uma proposta de contrato")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("membro").setDescription("Usuário a contratar").setRequired(true))
    .addStringOption(o => o.setName("nome_time").setDescription("Nome do time").setRequired(true))
    .addStringOption(o => o.setName("posicao").setDescription("Posição").setRequired(true))
    .addRoleOption(o => o.setName("cargo").setDescription("Cargo de time").setRequired(true)),
  new SlashCommandBuilder().setName("contratos-ativos").setDescription("📋 Contratos pendentes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("historico-contratos").setDescription("📜 Histórico de contratos")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("membro").setDescription("Filtrar por membro").setRequired(false)),
  new SlashCommandBuilder().setName("cancelar-contrato").setDescription("🗑️ Cancela um contrato pelo ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName("contract_id").setDescription("ID do contrato").setRequired(true)),
].map(c => c.toJSON());

// ──────────────────────────────────────────────
// CLIENT
// ──────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

process.on("unhandledRejection", (err) => console.error("[ERROR]", err));

// Checar contratos expirados
setInterval(async () => {
  const db  = loadDB();
  const now = Date.now() / 1000;
  const exp = Object.entries(db.contracts).filter(([,c]) => c.status === "pending" && now > c.expires_at);
  for (const [cid, c] of exp) {
    c.status = "expired"; db.history.push(c);
    try {
      const ch = client.channels.cache.get(String(c.channel_id));
      if (ch && c.message_id) { const msg = await ch.messages.fetch(String(c.message_id)); await msg.edit(payContratoExpirado(c)); }
    } catch {}
    delete db.contracts[cid];
  }
  if (exp.length) { saveDB(db); console.log(`[INFO] ${exp.length} contrato(s) expirado(s).`); }
}, 5 * 60 * 1000);

// Anti-link
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (member) {
    if (CARGOS_SUPORTE.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator)) return;
  }
  if (LINK_BLOQUEADO.test(message.content)) {
    try { await message.delete(); } catch {}
    const av = await message.channel.send(`🚫 ${message.author} links de convite do Roblox não são permitidos neste servidor!`);
    setTimeout(() => av.delete().catch(() => {}), 5000);
  }
});

// ──────────────────────────────────────────────
// INTERACTIONS
// ──────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === "aviso") {
      await interaction.deferReply({ flags: EPH });
      const titulo    = interaction.options.getString("titulo");
      const descricao = interaction.options.getString("descricao");
      const ch        = interaction.options.getChannel("canal") || interaction.channel;
      await ch.send({
        content: "@everyone",
        flags: CV2,
        components: [container([thumb(LOGO_URL), txt(`# ${titulo}\n\n${descricao}`), sep(), txt(`*Aviso emitido por ${interaction.user.displayName}*`)])],
      });
      await interaction.editReply({ content: `✅ Aviso enviado em ${ch}!` });
    }

    else if (cmd === "ticket") {
      await interaction.deferReply({ flags: EPH });
      const ch = interaction.options.getChannel("canal") || interaction.channel;
      await ch.send({
        flags: CV2,
        components: [
          container([
            thumb(LOGO_URL),
            txt(`# 🎫 | Ajuda e Suporte\n\n**A equipe *WSA* estará sempre pronta para atender o seu ticket, portanto, precisamos que você tenha paciência e calma ao nos relatar.**\n\n─\n\n- 🤔 **Dúvidas** — Perguntas gerais sobre a liga ou o servidor\n- 🤝 **Parcerias** — Propostas de parceria e divulgações\n- 🚨 **Denúncias** — Denunciar algum usuário do servidor\n- 🏆 **Ownar Clube** — Solicitar ownership de um clube\n- 📌 **Outros** — Outros assuntos não listados acima\n\n─\n\n> ⏳ O horário de atendimento do seu ticket será de **8:00 às 22:00**, fora esse horário a equipe não tem obrigação de responde-lo.\n\n*A equipe WSA agradece.*`),
          ]),
          rowDropdownTicket(),
        ],
      });
      await interaction.editReply({ content: `✅ Painel enviado em ${ch}!` });
    }

    else if (cmd === "contratar") {
      if (!interaction.member.roles.cache.has(MANAGER_ROLE_ID))
        return interaction.reply({ content: "❌ Você precisa ter o cargo de **Manager**!", flags: EPH });
      const membro   = interaction.options.getMember("membro");
      const nomeTime = interaction.options.getString("nome_time");
      const posicao  = interaction.options.getString("posicao");
      const cargo    = interaction.options.getRole("cargo");
      if (membro.user.bot) return interaction.reply({ content: "❌ Não pode contratar um bot.", flags: EPH });
      if (membro.id === interaction.user.id) return interaction.reply({ content: "❌ Não pode contratar a si mesmo.", flags: EPH });
      if (!CARGOS_TIMES.includes(cargo.id)) {
        const lista = CARGOS_TIMES.map(id => `<@&${id}>`).join("\n");
        return interaction.reply({ content: `❌ Cargo inválido!\n**Cargos permitidos:**\n${lista}`, flags: EPH });
      }
      const contractId = gerarContractId(membro.id, interaction.user.id);
      const now        = Date.now() / 1000;
      const c = {
        contract_id: contractId, signee_id: membro.id, signee_name: membro.user.username,
        contractor_id: interaction.user.id, contractor_name: interaction.user.username,
        team: nomeTime, position: posicao, role: cargo.name, role_id: cargo.id,
        status: "pending", created_at: now, expires_at: now + CONTRACT_EXPIRY_H * 3600,
        message_id: null, channel_id: CANAL_CONTRATOS_ID,
      };
      const db = loadDB(); db.contracts[contractId] = c; saveDB(db);
      const chContratos = interaction.guild.channels.cache.get(CANAL_CONTRATOS_ID);
      if (!chContratos) return interaction.reply({ content: "❌ Canal de contratos não encontrado.", flags: EPH });
      await interaction.reply({ content: "✅ Contrato enviado!", flags: EPH });
      const pay = payContratoPendente(c);
      const msg = await chContratos.send({
        content: `${membro}, você recebeu uma proposta de contrato de ${interaction.user}!`,
        flags: pay.flags,
        components: pay.components,
      });
      const db2 = loadDB(); if (db2.contracts[contractId]) { db2.contracts[contractId].message_id = msg.id; saveDB(db2); }
    }

    else if (cmd === "contratos-ativos") {
      if (!interaction.member.roles.cache.has(MANAGER_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ Sem permissão.", flags: EPH });
      const db      = loadDB();
      const pending = Object.values(db.contracts).filter(c => c.status === "pending");
      if (!pending.length) return interaction.reply({ content: "✅ Nenhum contrato pendente.", flags: EPH });
      const linhas = pending.map(c => `🔸 **${c.team}** — ${c.position}\n<@${c.signee_id}> ← <@${c.contractor_id}>\nExpira: \`${new Date(c.expires_at*1000).toLocaleString("pt-BR")}\``).join("\n\n");
      await interaction.reply({ flags: CV2|EPH, components: [container([txt(`## ⏳ Contratos Pendentes — WSA League\n\n${linhas}`)])] });
    }

    else if (cmd === "historico-contratos") {
      const db  = loadDB();
      let hist  = db.history || [];
      const u   = interaction.options.getUser("membro");
      if (u) hist = hist.filter(c => c.signee_id === u.id || c.contractor_id === u.id);
      if (!hist.length) return interaction.reply({ content: "📭 Nenhum contrato encontrado.", flags: EPH });
      const emj = { accepted:"✅", declined:"❌", expired:"⏰", cancelled:"🗑️" };
      const linhas = hist.slice(-10).reverse().map(c => `${emj[c.status]||"❓"} **${c.team||"—"}** — ${c.position||"—"}\n<@${c.signee_id}> ← <@${c.contractor_id}> \`${c.status.toUpperCase()}\``).join("\n\n");
      await interaction.reply({ flags: CV2|EPH, components: [container([txt(`## 📋 Histórico de Contratos — WSA League\n\n${linhas}`)])] });
    }

    else if (cmd === "cancelar-contrato") {
      const cid = interaction.options.getString("contract_id");
      const db  = loadDB();
      const c   = db.contracts[cid];
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: EPH });
      const ok = interaction.user.id === c.contractor_id || interaction.member.roles.cache.has(MANAGER_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!ok) return interaction.reply({ content: "❌ Apenas quem enviou pode cancelar.", flags: EPH });
      c.status = "cancelled"; db.history.push(c); delete db.contracts[cid]; saveDB(db);
      await interaction.reply({ content: `🗑️ Contrato \`${cid}\` cancelado.`, flags: EPH });
    }
  }

  else if (interaction.isButton()) {
    const id = interaction.customId;

    if (id === "btn_aceitar_contrato") {
      const db = loadDB();
      const c  = Object.values(db.contracts).find(x => x.message_id === interaction.message.id);
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: EPH });
      if (interaction.user.id !== c.signee_id) return interaction.reply({ content: "❌ Apenas o contratado pode aceitar.", flags: EPH });
      if (c.status !== "pending") return interaction.reply({ content: "⚠️ Contrato já processado.", flags: EPH });
      if (Date.now()/1000 > c.expires_at) return interaction.reply({ content: "⏰ Contrato expirado.", flags: EPH });
      c.status = "accepted"; c.answered_at = Date.now()/1000; db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      const member = interaction.guild.members.cache.get(c.signee_id);
      const role   = interaction.guild.roles.cache.get(String(c.role_id));
      if (member && role) await member.roles.add(role).catch(()=>{});
      const pay = payContratoAceito(c);
      await interaction.message.edit({ flags: pay.flags, components: pay.components });
      await interaction.reply({ content: `🎉 ${interaction.user} aceitou o contrato e foi contratado para o time **${c.team}**!` });
    }

    else if (id === "btn_recusar_contrato") {
      const db = loadDB();
      const c  = Object.values(db.contracts).find(x => x.message_id === interaction.message.id);
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: EPH });
      if (interaction.user.id !== c.signee_id) return interaction.reply({ content: "❌ Apenas o contratado pode recusar.", flags: EPH });
      if (c.status !== "pending") return interaction.reply({ content: "⚠️ Contrato já processado.", flags: EPH });
      c.status = "declined"; c.answered_at = Date.now()/1000; db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      const pay = payContratoRecusado(c);
      await interaction.message.edit({ flags: pay.flags, components: pay.components });
      await interaction.reply({ content: `❌ ${interaction.user} recusou o contrato.` });
    }

    else if (id === "btn_fechar_ticket") {
      const ehSuporte = CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id));
      const ehAdmin   = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!ehSuporte && !ehAdmin) return interaction.reply({ content: "❌ Apenas a staff pode fechar o ticket!", flags: EPH });
      ticketsAssumidos.delete(interaction.channelId);
      const donoId    = pegarDonoId(interaction.channel.topic || "");
      const canalNome = interaction.channel.name;
      await interaction.reply({ flags: CV2, components: [container([txt(`🔒 Ticket fechado por ${interaction.user}.\nO canal será deletado em **5 segundos**.`)], 0xFF4444)] });
      if (donoId) {
        try {
          const membro = interaction.guild.members.cache.get(donoId);
          if (membro) await membro.send({
            flags: CV2,
            components: [
              container([thumb(LOGO_URL), txt(`## 🔒 Seu Ticket Foi Encerrado\n\n**Ticket:** \`${canalNome}\`\n**Fechado por:** ${interaction.user}\n**Data:** ${new Date().toLocaleString("pt-BR")}\n\n⭐ **Como foi o nosso atendimento?**\nClique em uma estrela abaixo e escreva o motivo da sua nota:`)]),
              rowAvaliacao(),
            ],
          });
        } catch {}
      }
      setTimeout(() => interaction.channel.delete().catch(()=>{}), 5000);
    }

    else if (id === "btn_painel_membro") {
      if (CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id)))
        return interaction.reply({ content: "❌ Este painel é exclusivo para membros!", flags: EPH });
      await interaction.reply({ flags: CV2|EPH, components: [container([txt("👤 **Painel Membro**\n\nUse as opções abaixo para interagir com a staff:")], 0x5865F2), rowDropdownMembro()] });
    }

    else if (id === "btn_painel_staff") {
      const ehSuporte = CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id));
      if (!ehSuporte && !interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "❌ Este painel é exclusivo para a staff!", flags: EPH });
      await interaction.reply({ flags: CV2|EPH, components: [container([txt("👮 **Painel Staff**\n\nUse as opções abaixo para interagir com o membro:")]), rowDropdownStaff()] });
    }

    else if (id.startsWith("confirmar_ticket:")) {
      await interaction.deferUpdate();
      await criarCanalTicket(interaction, id.split(":")[1]);
    }

    else if (id === "cancelar_ticket") {
      await interaction.update({ content: "❌ Abertura de ticket cancelada.", components: [], flags: EPH });
    }

    else if (id.startsWith("aval_")) {
      const nota = parseInt(id.split("_")[1]);
      const modal = new ModalBuilder()
        .setCustomId(`modal_aval:${nota}:${interaction.user.id}`)
        .setTitle(`Avaliação — ${"⭐".repeat(nota)}`)
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("comentario").setLabel("Por que você deu essa nota?")
            .setStyle(TextInputStyle.Paragraph).setPlaceholder("Descreva sua experiência...").setRequired(true).setMaxLength(500)
        ));
      await interaction.showModal(modal);
    }
  }

  else if (interaction.isStringSelectMenu()) {
    const { customId, values } = interaction;

    if (customId === "ticket_select") {
      await interaction.reply({
        flags: CV2|EPH,
        components: [
          container([
            txt("## 📋 Regras do Canal de Tickets\n\n- Abra tickets apenas quando necessário\n- Explique o assunto de forma clara e objetiva\n- Não faça spam nem cobre respostas da staff\n- Tickets sem resposta por **12 horas** serão fechados\n- Mantenha o respeito em todas as situações\n- Em denúncias, envie provas *(prints, vídeos, links)*\n- Em denúncias por racismo, o usuário precisa estar no servidor\n\n⚠️ O descumprimento pode resultar em fechamento do ticket ou punições."),
            { type: 11, items: [{ media: { url: REGRAS_IMG } }] },
          ]),
          rowConfirmarTicket(values[0]),
        ],
      });
    }

    else if (customId === "painel_membro_select" && values[0] === "notificar_staff") {
      const cid = interaction.channelId;
      if (ticketsAssumidos.has(cid)) {
        await interaction.reply({ content: `🔔 ${interaction.user} está chamando o responsável!\n<@${ticketsAssumidos.get(cid)}>, o membro precisa de você!` });
      } else {
        await interaction.reply({ content: `🔔 ${interaction.user} está chamando a staff!\n${CARGOS_SUPORTE.map(id=>`<@&${id}>`).join(" ")}` });
      }
    }

    else if (customId === "painel_staff_select") {
      if (values[0] === "notificar_membro") {
        const donoId = pegarDonoId(interaction.channel.topic || "");
        const mencao = donoId ? `<@${donoId}>` : "membro";
        await interaction.reply({ content: `📣 ${interaction.user} está chamando o ${mencao}!\n${mencao}, a staff precisa de você no ticket!` });
      } else if (values[0] === "assumir_ticket") {
        const cid = interaction.channelId;
        if (ticketsAssumidos.has(cid)) {
          const rid = ticketsAssumidos.get(cid);
          return interaction.reply({ content: rid === interaction.user.id ? "⚠️ Você já é o responsável!" : `⚠️ Este ticket já foi assumido por <@${rid}>!`, flags: EPH });
        }
        ticketsAssumidos.set(cid, interaction.user.id);
        const donoId = pegarDonoId(interaction.channel.topic || "");
        const mencao = donoId ? `<@${donoId}>` : "";
        await interaction.reply({ content: `✋ ${interaction.user} assumiu este ticket!\n${mencao} seu ticket agora está sendo atendido por ${interaction.user}.` });
      }
    }
  }

  else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("modal_aval:")) {
      const parts      = interaction.customId.split(":");
      const nota       = parseInt(parts[1]);
      const donoId     = parts[2];
      const comentario = interaction.fields.getTextInputValue("comentario");
      const estrelas   = "⭐".repeat(nota) + "✩".repeat(5-nota);
      const descricoes = ["Muito ruim 😞","Ruim 😕","Regular 😐","Bom 😊","Excelente! 🎉"];
      const cores      = [0xFF4444,0xFF8C00,0xFFD700,0x90EE90,0x2ECC71];
      const guild = client.guilds.cache.get(GUILD_ID);
      if (guild) {
        const ch = guild.channels.cache.get(CANAL_LOGS_AVAL);
        if (ch) await ch.send({
          flags: CV2,
          components: [container([txt(`## ⭐ Nova Avaliação de Ticket\n\n**Usuário:** <@${donoId}>\n**Nota:** ${estrelas} \`${nota}/5\` — ${descricoes[nota-1]}\n\n**Comentário:**\n> ${comentario}\n\n*${new Date().toLocaleString("pt-BR")}*`)], cores[nota-1])],
        });
      }
      await interaction.reply({ content: "✅ Obrigado pela sua avaliação!", flags: EPH });
    }
  }
});

// ──────────────────────────────────────────────
// READY
// ──────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ Bot online como: ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log(`📡 Comandos sincronizados na guild ${GUILD_ID}`);
  } catch (e) { console.error("Erro ao sincronizar:", e); }
  client.user.setActivity("WSA League", { type: 3 });
});

client.login(TOKEN);