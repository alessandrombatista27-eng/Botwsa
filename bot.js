const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, ComponentType,
  PermissionFlagsBits,
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

// ──────────────────────────────────────────────
// CONFIGURAÇÃO
// ──────────────────────────────────────────────
const TOKEN    = process.env.DISCORD_TOKEN;
const GUILD_ID = "1482896148502020206";
const CLIENT_ID = process.env.CLIENT_ID || ""; // preencha com o ID do bot

const LOGO_URL = "https://cdn.discordapp.com/attachments/1482886716393001052/1484316968772304976/RJFCQ35-removebg-preview.png?ex=69bdc966&is=69bc77e6&hm=6954fecdcfae88d6c370a96f2297b539e092be7ed015b2e1ff2548c5a7c8933d&";
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
const CONTRACT_EXPIRY_H  = 24;
const DB_FILE            = path.join(__dirname, "contracts.json");

const LINK_BLOQUEADO = /https?:\/\/(www\.)?roblox\.com\/share\?code=/i;

const CATEGORIAS = {
  duvidas:     { label: "Dúvidas",    description: "Perguntas gerais sobre a liga ou o servidor.", emoji: "🤔" },
  parcerias:   { label: "Parcerias",   description: "Propostas de parceria e divulgações.",         emoji: "🤝" },
  denuncias:   { label: "Denúncias",   description: "Denunciar algum usuário do servidor.",         emoji: "🚨" },
  ownar_clube: { label: "Ownar Clube", description: "Solicitar ownership de um clube.",             emoji: "🏆" },
  outros:      { label: "Outros",      description: "Outros assuntos não listados acima.",          emoji: "📌" },
};

// Guarda quem assumiu cada ticket: { canalId: userId }
const ticketsAssumidos = new Map();

// ──────────────────────────────────────────────
// BANCO DE DADOS
// ──────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { contracts: {}, history: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function gerarContractId(signeeId, contractorId) {
  return `WSA${signeeId}_${contractorId}_${Date.now()}`;
}

// ──────────────────────────────────────────────
// HELPERS — COMPONENTS V2
// ──────────────────────────────────────────────

// Retorna um objeto de componente V2 do tipo "container" (MessageFlags.IsComponentsV2)
// Usamos type=17 (Container), type=10 (TextDisplay), type=11 (MediaGallery), type=14 (Separator)

function makeTextDisplay(content) {
  return { type: 10, content };
}
function makeSeparator(divider = true, spacing = 1) {
  return { type: 14, divider, spacing };
}
function makeThumbnail(url) {
  return { type: 11, items: [{ media: { url } }] };
}
function makeSection(content, accessory = null) {
  const obj = { type: 9, components: [{ type: 10, content }] };
  if (accessory) obj.accessory = accessory;
  return obj;
}
function makeContainer(components, accent_color = 0xFF6600) {
  return { type: 17, accent_color, components };
}

// Monta resposta Components V2
function cv2(components, ephemeral = false) {
  const flags = MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0);
  return { flags, components };
}

// ── Contrato pendente
function contratoComponents(c) {
  const issued  = new Date(c.created_at * 1000).toLocaleString("pt-BR");
  const expires = new Date(c.expires_at * 1000).toLocaleString("pt-BR");
  return [makeContainer([
    makeThumbnail(LOGO_URL),
    makeTextDisplay(`## 📋 Proposta de Contrato — WSA League`),
    makeSeparator(),
    makeTextDisplay(
      `**Contratado:** <@${c.signee_id}> \`${c.signee_name}\`\n` +
      `**Contratante:** <@${c.contractor_id}> \`${c.contractor_name}\`\n` +
      `**Contract ID:** \`${c.contract_id}\`\n\n` +
      `**Time:** ${c.team}\n**Posição:** ${c.position}\n**Cargo:** ${c.role}\n\n` +
      `*Emitido: ${issued} • Expira: ${expires}*`
    ),
  ])];
}

function contratoAceitoComponents(c) {
  return [makeContainer([
    makeTextDisplay(`## ✅ Contrato Aceito`),
    makeSeparator(),
    makeTextDisplay(
      `<@${c.signee_id}> aceitou o contrato e agora faz parte do time **${c.team}**!\n\n` +
      `**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``
    ),
  ], 0x2ECC71)];
}
function contratoRecusadoComponents(c) {
  return [makeContainer([
    makeTextDisplay(`## ❌ Contrato Recusado`),
    makeSeparator(),
    makeTextDisplay(
      `<@${c.signee_id}> recusou a proposta.\n\n` +
      `**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``
    ),
  ], 0x95A5A6)];
}
function contratoExpiradoComponents(c) {
  return [makeContainer([
    makeTextDisplay(`## ⏰ Contrato Expirado`),
    makeSeparator(),
    makeTextDisplay(
      `Este contrato expirou. Peça ao manager para enviar uma nova proposta.\n\n` +
      `**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``
    ),
  ], 0x992D22)];
}

// ── Botões contrato
function botoesContrato() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("btn_aceitar_contrato").setLabel("✅  Aceitar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("btn_recusar_contrato").setLabel("❌  Recusar").setStyle(ButtonStyle.Danger),
  );
}

// ── Botões ticket
function botoesTicket() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("btn_fechar_ticket").setLabel("🔒 Fechar Ticket").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("btn_painel_membro").setLabel("👤 Painel Membro").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_painel_staff").setLabel("👮 Painel Staff").setStyle(ButtonStyle.Secondary),
  );
}

// ── Dropdown ticket (painel principal)
function dropdownTicket() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Selecione uma opção:")
    .addOptions(
      Object.entries(CATEGORIAS).map(([key, cat]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setDescription(cat.description)
          .setEmoji(cat.emoji)
          .setValue(key)
      )
    );
  return new ActionRowBuilder().addComponents(select);
}

// ── Dropdown painel membro
function dropdownMembro() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("painel_membro_select")
    .setPlaceholder("Selecione o que deseja fazer")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Notificar Staff").setDescription("Envia um ping para quem está atendendo o ticket.").setEmoji("🔔").setValue("notificar_staff")
    );
  return new ActionRowBuilder().addComponents(select);
}

// ── Dropdown painel staff
function dropdownStaff() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("painel_staff_select")
    .setPlaceholder("Selecione o que deseja fazer")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Notificar Membro").setDescription("Envia um ping para o membro no canal.").setEmoji("📣").setValue("notificar_membro"),
      new StringSelectMenuOptionBuilder().setLabel("Assumir Ticket").setDescription("Marca você como responsável por este ticket.").setEmoji("✋").setValue("assumir_ticket"),
    );
  return new ActionRowBuilder().addComponents(select);
}

// ── Botões confirmar ticket
function botoesConfirmarTicket(categoriaKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirmar_ticket:${categoriaKey}`).setLabel("✅ Confirmar e Abrir Ticket").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("cancelar_ticket").setLabel("Cancelar").setStyle(ButtonStyle.Danger),
  );
}

// ── Botões avaliação
function botoesAvaliacao() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aval_1").setLabel("⭐ 1").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("aval_2").setLabel("⭐ 2").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("aval_3").setLabel("⭐ 3").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("aval_4").setLabel("⭐ 4").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("aval_5").setLabel("⭐ 5").setStyle(ButtonStyle.Success),
  );
}

// ── Helper: pegar dono do ticket pelo topic
function pegarDonoId(topic) {
  for (const part of (topic || "").split("|")) {
    const t = part.trim();
    if (t.startsWith("ID:")) {
      const id = t.replace("ID:", "").trim();
      if (id) return id;
    }
  }
  return null;
}

// ──────────────────────────────────────────────
// CRIAÇÃO DE CANAL DE TICKET
// ──────────────────────────────────────────────
async function criarCanalTicket(interaction, categoriaKey) {
  const guild = interaction.guild;
  const cat   = CATEGORIAS[categoriaKey];
  const prefixo   = categoriaKey.replace("_", "-");
  const nomeCanalBase = `${prefixo}-${interaction.user.username.toLowerCase().replace(/\s+/g, "-")}`;

  const existente = guild.channels.cache.find(c => c.name === nomeCanalBase);
  if (existente) {
    await interaction.followUp({ content: `❌ Você já tem um ticket aberto em ${existente}!`, flags: MessageFlags.Ephemeral });
    return;
  }

  const permOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];
  for (const id of CARGOS_SUPORTE) {
    const role = guild.roles.cache.get(id);
    if (role) permOverwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const categoria = guild.channels.cache.get(CATEGORIA_TICKETS);
  const canal = await guild.channels.create({
    name: nomeCanalBase,
    type: 0,
    parent: categoria || null,
    permissionOverwrites: permOverwrites,
    topic: `Ticket de ${interaction.user.displayName} | Categoria: ${cat.label} | ID: ${interaction.user.id}`,
  });

  const mencoes = CARGOS_SUPORTE.map(id => `<@&${id}>`).join(" ");
  const components = [
    makeContainer([
      makeThumbnail(LOGO_URL),
      makeTextDisplay(
        `# ${cat.emoji} ${cat.label}\n\n` +
        `Olá <@${interaction.user.id}>! A equipe de suporte irá te atender em breve.\n\n` +
        `**Categoria:** ${cat.emoji} ${cat.label}\n**Descrição:** ${cat.description}\n\n` +
        `Descreva sua situação com o máximo de detalhes possível.\n\n` +
        `⏰ Horário de atendimento: **08:00 às 22:00**`
      ),
    ]),
    botoesTicket(),
  ];

  await canal.send({
    content: `<@${interaction.user.id}> ${mencoes}`,
    flags: MessageFlags.IsComponentsV2,
    components,
  });

  await interaction.followUp({ content: `✅ Ticket aberto em ${canal}!`, flags: MessageFlags.Ephemeral });
}

// ──────────────────────────────────────────────
// SLASH COMMANDS
// ──────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("aviso")
    .setDescription("📢 Envia um aviso oficial no canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("titulo").setDescription("Título do aviso").setRequired(true))
    .addStringOption(o => o.setName("descricao").setDescription("Descrição do aviso").setRequired(true))
    .addChannelOption(o => o.setName("canal").setDescription("Canal de destino (padrão: atual)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("🎫 Envia o painel de ticket no canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName("canal").setDescription("Canal de destino (padrão: atual)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("contratar")
    .setDescription("📝 Envia uma proposta de contrato para um membro")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("membro").setDescription("O usuário que você quer contratar").setRequired(true))
    .addStringOption(o => o.setName("nome_time").setDescription("Nome do time").setRequired(true))
    .addStringOption(o => o.setName("posicao").setDescription("Posição (ex: Atacante, Goleiro...)").setRequired(true))
    .addRoleOption(o => o.setName("cargo").setDescription("Cargo de time que será dado ao contratado").setRequired(true)),

  new SlashCommandBuilder()
    .setName("contratos-ativos")
    .setDescription("📋 Veja os contratos pendentes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName("historico-contratos")
    .setDescription("📜 Histórico de contratos do servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o => o.setName("membro").setDescription("Filtrar por membro (opcional)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("cancelar-contrato")
    .setDescription("🗑️ Cancela um contrato pendente pelo ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o => o.setName("contract_id").setDescription("ID do contrato").setRequired(true)),
].map(c => c.toJSON());

// ──────────────────────────────────────────────
// CLIENT
// ──────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ── Checar contratos expirados a cada 5 min
setInterval(async () => {
  const db  = loadDB();
  const now = Date.now() / 1000;
  const expirados = Object.entries(db.contracts).filter(([, c]) => c.status === "pending" && now > c.expires_at);
  for (const [cid, c] of expirados) {
    c.status = "expired";
    db.history.push(c);
    try {
      const ch = client.channels.cache.get(String(c.channel_id));
      if (ch && c.message_id) {
        const msg = await ch.messages.fetch(String(c.message_id));
        await msg.edit({ flags: MessageFlags.IsComponentsV2, components: contratoExpiradoComponents(c) });
      }
    } catch {}
    delete db.contracts[cid];
  }
  if (expirados.length) { saveDB(db); console.log(`[INFO] ${expirados.length} contrato(s) expirado(s).`); }
}, 5 * 60 * 1000);

// ──────────────────────────────────────────────
// ANTI-LINK
// ──────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (member) {
    const ehSuporte = CARGOS_SUPORTE.some(id => member.roles.cache.has(id));
    const ehAdmin   = member.permissions.has(PermissionFlagsBits.Administrator);
    if (ehSuporte || ehAdmin) return;
  }
  if (LINK_BLOQUEADO.test(message.content)) {
    try { await message.delete(); } catch {}
    const aviso = await message.channel.send(`🚫 ${message.author} links de convite do Roblox não são permitidos neste servidor!`);
    setTimeout(() => aviso.delete().catch(() => {}), 5000);
  }
});

// ──────────────────────────────────────────────
// SLASH COMMAND HANDLER
// ──────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

  // ══ SLASH COMMANDS ══
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /aviso
    if (commandName === "aviso") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const titulo   = interaction.options.getString("titulo");
      const descricao = interaction.options.getString("descricao");
      const canalAlvo = interaction.options.getChannel("canal") || interaction.channel;
      const components = [
        makeContainer([
          makeThumbnail(LOGO_URL),
          makeTextDisplay(`# ${titulo}\n\n${descricao}`),
          makeSeparator(),
          makeTextDisplay(`*Aviso emitido por ${interaction.user.displayName}*`),
        ]),
      ];
      await canalAlvo.send({ content: "@everyone", flags: MessageFlags.IsComponentsV2, components });
      await interaction.editReply({ content: `✅ Aviso enviado em ${canalAlvo}!` });
    }

    // /ticket
    else if (commandName === "ticket") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const canalAlvo = interaction.options.getChannel("canal") || interaction.channel;
      const components = [
        makeContainer([
          makeThumbnail(LOGO_URL),
          makeTextDisplay(
            `# 🎫 | Ajuda e Suporte\n\n` +
            `**A equipe *WSA* estará sempre pronta para atender o seu ticket, portanto, precisamos que você tenha paciência e calma ao nos relatar.**\n\n─\n\n` +
            `- 🤔 **Dúvidas** — Perguntas gerais sobre a liga ou o servidor\n` +
            `- 🤝 **Parcerias** — Propostas de parceria e divulgações\n` +
            `- 🚨 **Denúncias** — Denunciar algum usuário do servidor\n` +
            `- 🏆 **Ownar Clube** — Solicitar ownership de um clube\n` +
            `- 📌 **Outros** — Outros assuntos não listados acima\n\n─\n\n` +
            `> ⏳ O horário de atendimento do seu ticket será de **8:00 às 22:00**, fora esse horário a equipe não tem obrigação de responde-lo.\n\n` +
            `*A equipe WSA agradece.*`
          ),
        ]),
        dropdownTicket(),
      ];
      await canalAlvo.send({ flags: MessageFlags.IsComponentsV2, components });
      await interaction.editReply({ content: `✅ Painel enviado em ${canalAlvo}!` });
    }

    // /contratar
    else if (commandName === "contratar") {
      const managerRole = interaction.guild.roles.cache.get(MANAGER_ROLE_ID);
      if (!managerRole || !interaction.member.roles.cache.has(MANAGER_ROLE_ID)) {
        return interaction.reply({ content: "❌ Você precisa ter o cargo de **Manager** para contratar membros!", flags: MessageFlags.Ephemeral });
      }
      const membro   = interaction.options.getMember("membro");
      const nomeTime = interaction.options.getString("nome_time");
      const posicao  = interaction.options.getString("posicao");
      const cargo    = interaction.options.getRole("cargo");
      if (membro.user.bot) return interaction.reply({ content: "❌ Não pode contratar um bot.", flags: MessageFlags.Ephemeral });
      if (membro.id === interaction.user.id) return interaction.reply({ content: "❌ Não pode contratar a si mesmo.", flags: MessageFlags.Ephemeral });
      if (!CARGOS_TIMES.includes(cargo.id)) {
        const lista = CARGOS_TIMES.map(id => `<@&${id}>`).join("\n");
        return interaction.reply({ content: `❌ Cargo inválido! **Cargos permitidos:**\n${lista}`, flags: MessageFlags.Ephemeral });
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
      const db = loadDB();
      db.contracts[contractId] = c;
      saveDB(db);
      const canalContratos = interaction.guild.channels.cache.get(CANAL_CONTRATOS_ID);
      if (!canalContratos) return interaction.reply({ content: "❌ Canal de contratos não encontrado.", flags: MessageFlags.Ephemeral });
      const payload = {
        content: `${membro}, você recebeu uma proposta de contrato de ${interaction.user}!`,
        flags: MessageFlags.IsComponentsV2,
        components: [...contratoComponents(c), botoesContrato()],
      };
      let msg;
      if (interaction.channelId !== CANAL_CONTRATOS_ID) {
        await interaction.reply({ content: "✅ Contrato enviado!", flags: MessageFlags.Ephemeral });
        msg = await canalContratos.send(payload);
      } else {
        await interaction.reply(payload);
        msg = await interaction.fetchReply();
      }
      const db2 = loadDB();
      if (db2.contracts[contractId]) { db2.contracts[contractId].message_id = msg.id; saveDB(db2); }
    }

    // /contratos-ativos
    else if (commandName === "contratos-ativos") {
      const managerRole = interaction.guild.roles.cache.get(MANAGER_ROLE_ID);
      if (!managerRole || (!interaction.member.roles.cache.has(MANAGER_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator))) {
        return interaction.reply({ content: "❌ Sem permissão.", flags: MessageFlags.Ephemeral });
      }
      const db      = loadDB();
      const pending = Object.values(db.contracts).filter(c => c.status === "pending");
      if (!pending.length) return interaction.reply({ content: "✅ Nenhum contrato pendente.", flags: MessageFlags.Ephemeral });
      const linhas = pending.map(c => {
        const exp = new Date(c.expires_at * 1000).toLocaleString("pt-BR");
        return `🔸 **${c.team}** — ${c.position}\n<@${c.signee_id}> ← <@${c.contractor_id}>\nExpira: \`${exp}\``;
      }).join("\n\n");
      const components = [makeContainer([makeTextDisplay(`## ⏳ Contratos Pendentes — WSA League\n\n${linhas}`)])];
      await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components });
    }

    // /historico-contratos
    else if (commandName === "historico-contratos") {
      const db      = loadDB();
      let history   = db.history || [];
      const membroOpt = interaction.options.getUser("membro");
      if (membroOpt) history = history.filter(c => c.signee_id === membroOpt.id || c.contractor_id === membroOpt.id);
      if (!history.length) return interaction.reply({ content: "📭 Nenhum contrato encontrado.", flags: MessageFlags.Ephemeral });
      const emojis = { accepted: "✅", declined: "❌", expired: "⏰", cancelled: "🗑️" };
      const linhas = history.slice(-10).reverse().map(c =>
        `${emojis[c.status] || "❓"} **${c.team || "—"}** — ${c.position || "—"}\n<@${c.signee_id}> ← <@${c.contractor_id}> \`${c.status.toUpperCase()}\``
      ).join("\n\n");
      const components = [makeContainer([makeTextDisplay(`## 📋 Histórico de Contratos — WSA League\n\n${linhas}`)])];
      await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components });
    }

    // /cancelar-contrato
    else if (commandName === "cancelar-contrato") {
      const contractId = interaction.options.getString("contract_id");
      const db = loadDB();
      const c  = db.contracts[contractId];
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: MessageFlags.Ephemeral });
      const isContractor = interaction.user.id === c.contractor_id;
      const isManager    = interaction.member.roles.cache.has(MANAGER_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isContractor && !isManager) return interaction.reply({ content: "❌ Apenas quem enviou o contrato pode cancelá-lo.", flags: MessageFlags.Ephemeral });
      c.status = "cancelled";
      db.history.push(c);
      delete db.contracts[contractId];
      saveDB(db);
      await interaction.reply({ content: `🗑️ Contrato \`${contractId}\` cancelado com sucesso.`, flags: MessageFlags.Ephemeral });
    }
  }

  // ══ BUTTONS ══
  else if (interaction.isButton()) {
    const { customId } = interaction;

    // Aceitar contrato
    if (customId === "btn_aceitar_contrato") {
      const db = loadDB();
      const c  = Object.values(db.contracts).find(x => {
        const msg = interaction.message;
        return msg.components && x.message_id === msg.id;
      }) || (() => {
        // fallback: busca por signee_id na mensagem
        return Object.values(db.contracts).find(x => x.message_id === interaction.message.id);
      })();
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== c.signee_id) return interaction.reply({ content: "❌ Apenas o contratado pode aceitar.", flags: MessageFlags.Ephemeral });
      if (c.status !== "pending") return interaction.reply({ content: "⚠️ Contrato já processado.", flags: MessageFlags.Ephemeral });
      if (Date.now() / 1000 > c.expires_at) return interaction.reply({ content: "⏰ Contrato expirado.", flags: MessageFlags.Ephemeral });
      c.status = "accepted"; c.answered_at = Date.now() / 1000;
      db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      const member = interaction.guild.members.cache.get(c.signee_id);
      const role   = interaction.guild.roles.cache.get(String(c.role_id));
      if (member && role) await member.roles.add(role).catch(() => {});
      await interaction.message.edit({ flags: MessageFlags.IsComponentsV2, components: contratoAceitoComponents(c) });
      await interaction.reply({ content: `🎉 ${interaction.user} aceitou o contrato e foi contratado para o time **${c.team}**!` });
    }

    // Recusar contrato
    else if (customId === "btn_recusar_contrato") {
      const db = loadDB();
      const c  = Object.values(db.contracts).find(x => x.message_id === interaction.message.id);
      if (!c) return interaction.reply({ content: "❌ Contrato não encontrado.", flags: MessageFlags.Ephemeral });
      if (interaction.user.id !== c.signee_id) return interaction.reply({ content: "❌ Apenas o contratado pode recusar.", flags: MessageFlags.Ephemeral });
      if (c.status !== "pending") return interaction.reply({ content: "⚠️ Contrato já processado.", flags: MessageFlags.Ephemeral });
      c.status = "declined"; c.answered_at = Date.now() / 1000;
      db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      await interaction.message.edit({ flags: MessageFlags.IsComponentsV2, components: contratoRecusadoComponents(c) });
      await interaction.reply({ content: `❌ ${interaction.user} recusou o contrato.` });
    }

    // Fechar ticket
    else if (customId === "btn_fechar_ticket") {
      const ehSuporte = CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id));
      const ehAdmin   = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!ehSuporte && !ehAdmin) return interaction.reply({ content: "❌ Apenas a staff pode fechar o ticket!", flags: MessageFlags.Ephemeral });
      ticketsAssumidos.delete(interaction.channelId);
      const donoId   = pegarDonoId(interaction.channel.topic || "");
      const canalNome = interaction.channel.name;
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [makeContainer([makeTextDisplay(`🔒 Ticket fechado por ${interaction.user}.\nO canal será deletado em **5 segundos**.`)], 0xFF4444)],
      });
      // DM avaliação
      if (donoId) {
        try {
          const membro = interaction.guild.members.cache.get(donoId);
          if (membro) {
            const data = new Date().toLocaleString("pt-BR");
            await membro.send({
              flags: MessageFlags.IsComponentsV2,
              components: [
                makeContainer([
                  makeThumbnail(LOGO_URL),
                  makeTextDisplay(
                    `## 🔒 Seu Ticket Foi Encerrado\n\n` +
                    `**Ticket:** \`${canalNome}\`\n**Fechado por:** ${interaction.user}\n**Data:** ${data}\n\n` +
                    `⭐ **Como foi o nosso atendimento?**\nClique em uma estrela abaixo e escreva o motivo da sua nota:`
                  ),
                ]),
                botoesAvaliacao(),
              ],
            });
          }
        } catch {}
      }
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // Painel membro
    else if (customId === "btn_painel_membro") {
      const ehSuporte = CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id));
      if (ehSuporte) return interaction.reply({ content: "❌ Este painel é exclusivo para membros!", flags: MessageFlags.Ephemeral });
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [
          makeContainer([makeTextDisplay("👤 **Painel Membro**\n\nUse as opções abaixo para interagir com a staff:")], 0x5865F2),
          dropdownMembro(),
        ],
      });
    }

    // Painel staff
    else if (customId === "btn_painel_staff") {
      const ehSuporte = CARGOS_SUPORTE.some(id => interaction.member.roles.cache.has(id));
      const ehAdmin   = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!ehSuporte && !ehAdmin) return interaction.reply({ content: "❌ Este painel é exclusivo para a staff!", flags: MessageFlags.Ephemeral });
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [
          makeContainer([makeTextDisplay("👮 **Painel Staff**\n\nUse as opções abaixo para interagir com o membro:")]),
          dropdownStaff(),
        ],
      });
    }

    // Confirmar ticket
    else if (customId.startsWith("confirmar_ticket:")) {
      const categoriaKey = customId.split(":")[1];
      await interaction.deferUpdate();
      await criarCanalTicket(interaction, categoriaKey);
    }

    // Cancelar ticket
    else if (customId === "cancelar_ticket") {
      await interaction.update({ content: "❌ Abertura de ticket cancelada.", components: [], flags: MessageFlags.Ephemeral });
    }

    // Avaliação estrelas
    else if (customId.startsWith("aval_")) {
      const nota = parseInt(customId.split("_")[1]);
      const modal = new ModalBuilder()
        .setCustomId(`modal_aval:${nota}:${interaction.user.id}:${interaction.message.id}`)
        .setTitle(`Avaliação — ${"⭐".repeat(nota)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("comentario")
              .setLabel("Por que você deu essa nota?")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Descreva brevemente sua experiência com o atendimento...")
              .setRequired(true)
              .setMaxLength(500)
          )
        );
      await interaction.showModal(modal);
    }
  }

  // ══ SELECT MENUS ══
  else if (interaction.isStringSelectMenu()) {
    const { customId, values } = interaction;

    // Ticket select (painel principal)
    if (customId === "ticket_select") {
      const categoriaKey = values[0];
      const cat = CATEGORIAS[categoriaKey];
      await interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [
          makeContainer([
            makeTextDisplay(
              `## 📋 Regras do Canal de Tickets\n\n` +
              `- Abra tickets apenas quando necessário\n` +
              `- Explique o assunto de forma clara e objetiva\n` +
              `- Não faça spam nem cobre respostas da staff\n` +
              `- Tickets sem resposta por **12 horas** serão fechados\n` +
              `- Mantenha o respeito em todas as situações\n` +
              `- Em denúncias, envie provas *(prints, vídeos, links)*\n` +
              `- Em denúncias por racismo, o usuário precisa estar no servidor\n\n` +
              `⚠️ O descumprimento pode resultar em fechamento do ticket ou punições.`
            ),
            { type: 11, items: [{ media: { url: REGRAS_IMG } }] },
          ]),
          botoesConfirmarTicket(categoriaKey),
        ],
      });
    }

    // Painel membro select
    else if (customId === "painel_membro_select") {
      if (values[0] === "notificar_staff") {
        const canalId = interaction.channelId;
        if (ticketsAssumidos.has(canalId)) {
          const respId = ticketsAssumidos.get(canalId);
          await interaction.reply({ content: `🔔 ${interaction.user} está chamando o responsável pelo ticket!\n<@${respId}>, o membro precisa de você!` });
        } else {
          const mencoes = CARGOS_SUPORTE.map(id => `<@&${id}>`).join(" ");
          await interaction.reply({ content: `🔔 ${interaction.user} está chamando a staff!\n${mencoes}` });
        }
      }
    }

    // Painel staff select
    else if (customId === "painel_staff_select") {
      if (values[0] === "notificar_membro") {
        const donoId = pegarDonoId(interaction.channel.topic || "");
        const mencao = donoId ? `<@${donoId}>` : "membro";
        await interaction.reply({ content: `📣 ${interaction.user} está chamando o ${mencao}!\n${mencao}, a staff precisa de você no ticket!` });
      } else if (values[0] === "assumir_ticket") {
        const canalId = interaction.channelId;
        if (ticketsAssumidos.has(canalId)) {
          const respId = ticketsAssumidos.get(canalId);
          const msg = respId === interaction.user.id ? "⚠️ Você já é o responsável por este ticket!" : `⚠️ Este ticket já foi assumido por <@${respId}>!`;
          return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
        ticketsAssumidos.set(canalId, interaction.user.id);
        const donoId = pegarDonoId(interaction.channel.topic || "");
        const mencao = donoId ? `<@${donoId}>` : "";
        await interaction.reply({ content: `✋ ${interaction.user} assumiu este ticket e irá te atender!\n${mencao} seu ticket agora está sendo atendido por ${interaction.user}.` });
      }
    }
  }

  // ══ MODALS ══
  else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("modal_aval:")) {
      const parts    = interaction.customId.split(":");
      const nota     = parseInt(parts[1]);
      const donoId   = parts[2];
      const canalNome = interaction.message?.embeds?.[0]?.description?.match(/`([^`]+)`/)?.[1] || "ticket";
      const comentario = interaction.fields.getTextInputValue("comentario");
      const estrelas   = "⭐".repeat(nota) + "✩".repeat(5 - nota);
      const descricoes = ["Muito ruim 😞","Ruim 😕","Regular 😐","Bom 😊","Excelente! 🎉"];
      const cores      = [0xFF4444, 0xFF8C00, 0xFFD700, 0x90EE90, 0x2ECC71];
      const guild = client.guilds.cache.get(GUILD_ID);
      if (guild) {
        const canalLog = guild.channels.cache.get(CANAL_LOGS_AVAL);
        if (canalLog) {
          await canalLog.send({
            flags: MessageFlags.IsComponentsV2,
            components: [makeContainer([
              makeTextDisplay(
                `## ⭐ Nova Avaliação de Ticket\n\n` +
                `**Usuário:** <@${donoId}>\n` +
                `**Nota:** ${estrelas}  \`${nota}/5\` — ${descricoes[nota-1]}\n\n` +
                `**Comentário:**\n> ${comentario}\n\n` +
                `*${new Date().toLocaleString("pt-BR")}*`
              ),
            ], cores[nota-1])],
          });
        }
      }
      await interaction.reply({ content: "✅ Obrigado pela sua avaliação!", flags: MessageFlags.Ephemeral });
    }
  }
});

// ──────────────────────────────────────────────
// READY
// ──────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ Bot online como: ${client.user.tag}`);

  // Registrar comandos na guild
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    const appId = client.user.id;
    await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), { body: commands });
    console.log(`📡 Comandos sincronizados na guild ${GUILD_ID}`);
  } catch (e) {
    console.error("Erro ao sincronizar comandos:", e);
  }

  client.user.setActivity("WSA League", { type: 3 }); // Watching
});

client.login(TOKEN);