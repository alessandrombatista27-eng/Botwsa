const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, ModalBuilder, ActionRowBuilder,
  TextInputBuilder, TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

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

const CV2 = 1 << 15;
const EPH = 1 << 6;

const CATEGORIAS = {
  duvidas:     { label: "Dúvidas",    description: "Perguntas gerais sobre a liga ou o servidor.", emoji: "🤔" },
  parcerias:   { label: "Parcerias",   description: "Propostas de parceria e divulgações.",         emoji: "🤝" },
  denuncias:   { label: "Denúncias",   description: "Denunciar algum usuário do servidor.",         emoji: "🚨" },
  ownar_clube: { label: "Ownar Clube", description: "Solicitar ownership de um clube.",             emoji: "🏆" },
  outros:      { label: "Outros",      description: "Outros assuntos não listados acima.",          emoji: "📌" },
};

const ticketsAssumidos = new Map();

// ── REST instance — inicializado direto
const rest = new REST({ version: "10" }).setToken(TOKEN);

// ── Wrappers REST direto — bypass discord.js MessagePayload
const sendRaw     = (chId, body)        => rest.post(Routes.channelMessages(chId), { body });
const editRaw     = (chId, msgId, body) => rest.patch(Routes.channelMessage(chId, msgId), { body });
const replyRaw    = (i, body)           => rest.post(Routes.interactionCallback(i.id, i.token), { body: { type: 4, data: body } });
const deferRaw    = (i, flags=0)        => rest.post(Routes.interactionCallback(i.id, i.token), { body: { type: 5, data: { flags } } });
const editReplyRaw= (i, body)           => rest.patch(Routes.webhookMessage(i.applicationId, i.token, "@original"), { body });
const followupRaw = (i, body)           => rest.post(Routes.webhook(i.applicationId, i.token), { body });
const updateRaw   = (i, body)           => rest.post(Routes.interactionCallback(i.id, i.token), { body: { type: 7, data: body } });
const deferUpdateRaw = (i)              => rest.post(Routes.interactionCallback(i.id, i.token), { body: { type: 6 } });
const dmRaw = async (userId, body) => {
  const dm = await rest.post(Routes.userChannels(), { body: { recipient_id: userId } });
  return rest.post(Routes.channelMessages(dm.id), { body });
};
const showModalRaw = (i, modal) => rest.post(Routes.interactionCallback(i.id, i.token), { body: { type: 9, data: modal } });

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
// COMPONENTS V2 — 100% raw JSON
// ──────────────────────────────────────────────
const txt       = (content)               => ({ type: 10, content });
const sep       = ()                      => ({ type: 14, divider: true, spacing: 1 });
const thumb     = (url)                   => ({ type: 11, items: [{ media: { url } }] });
const container = (comps, color=0xFF6600) => ({ type: 17, accent_color: color, components: comps });
const row       = (...comps)              => ({ type: 1, components: comps });
const btn       = (custom_id, label, style) => ({ type: 2, custom_id, label, style });
const select    = (custom_id, placeholder, options) => ({
  type: 1, components: [{ type: 3, custom_id, placeholder, min_values: 1, max_values: 1, options }],
});
const opt = (label, value, description, emoji) => ({ label, value, description, emoji: { name: emoji } });

const rowBotoesTicket    = () => row(btn("btn_fechar_ticket","🔒 Fechar Ticket",4), btn("btn_painel_membro","👤 Painel Membro",2), btn("btn_painel_staff","👮 Painel Staff",2));
const rowBotoesContrato  = () => row(btn("btn_aceitar_contrato","✅  Aceitar",3), btn("btn_recusar_contrato","❌  Recusar",4));
const rowConfirmar       = (k) => row(btn(`confirmar_ticket:${k}`,"✅ Confirmar e Abrir Ticket",3), btn("cancelar_ticket","Cancelar",4));
const rowAvaliacao       = () => row(btn("aval_1","⭐ 1",4),btn("aval_2","⭐ 2",4),btn("aval_3","⭐ 3",2),btn("aval_4","⭐ 4",3),btn("aval_5","⭐ 5",3));
const rowSelectTicket    = () => select("ticket_select","Selecione uma opção:",[
  opt("Dúvidas","duvidas","Perguntas gerais sobre a liga ou o servidor.","🤔"),
  opt("Parcerias","parcerias","Propostas de parceria e divulgações.","🤝"),
  opt("Denúncias","denuncias","Denunciar algum usuário do servidor.","🚨"),
  opt("Ownar Clube","ownar_clube","Solicitar ownership de um clube.","🏆"),
  opt("Outros","outros","Outros assuntos não listados acima.","📌"),
]);
const rowSelectMembro    = () => select("painel_membro_select","Selecione o que deseja fazer",[opt("Notificar Staff","notificar_staff","Envia um ping para quem está atendendo o ticket.","🔔")]);
const rowSelectStaff     = () => select("painel_staff_select","Selecione o que deseja fazer",[
  opt("Notificar Membro","notificar_membro","Envia um ping para o membro no canal.","📣"),
  opt("Assumir Ticket","assumir_ticket","Marca você como responsável por este ticket.","✋"),
]);

function payContratoPendente(c) {
  const issued  = new Date(c.created_at*1000).toLocaleString("pt-BR");
  const expires = new Date(c.expires_at*1000).toLocaleString("pt-BR");
  return { flags: CV2, components: [
    container([txt("## 📋 Proposta de Contrato — WSA League"), sep(),
      txt(`**Contratado:** <@${c.signee_id}> \`${c.signee_name}\`\n**Contratante:** <@${c.contractor_id}> \`${c.contractor_name}\`\n**Contract ID:** \`${c.contract_id}\`\n\n**Time:** ${c.team}\n**Posição:** ${c.position}\n**Cargo:** ${c.role}\n\n*Emitido: ${issued} • Expira: ${expires}*`)]),
    rowBotoesContrato(),
  ]};
}
const payAceito   = (c) => ({ flags: CV2, components: [container([txt(`## ✅ Contrato Aceito\n\n<@${c.signee_id}> aceitou e agora faz parte do time **${c.team}**!\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)],0x2ECC71)]});
const payRecusado = (c) => ({ flags: CV2, components: [container([txt(`## ❌ Contrato Recusado\n\n<@${c.signee_id}> recusou.\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)],0x95A5A6)]});
const payExpirado = (c) => ({ flags: CV2, components: [container([txt(`## ⏰ Contrato Expirado\n\n**Contratado:** <@${c.signee_id}>\n**Contratante:** <@${c.contractor_id}>\n**ID:** \`${c.contract_id}\``)],0x992D22)]});

function pegarDonoId(topic) {
  for (const p of (topic||"").split("|")) { const t=p.trim(); if(t.startsWith("ID:")) { const id=t.replace("ID:","").trim(); if(id) return id; } }
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
  if (existente) { await followupRaw(interaction, { content: `❌ Você já tem um ticket em <#${existente.id}>!`, flags: EPH }); return; }

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
    parent: guild.channels.cache.get(CATEGORIA_TICKETS)||null,
    permissionOverwrites: overwrites,
    topic: `Ticket de ${interaction.user.displayName} | Categoria: ${cat.label} | ID: ${interaction.user.id}`,
  });
  const mencoes = CARGOS_SUPORTE.map(id=>`<@&${id}>`).join(" ");
  await sendRaw(canal.id, {
    content: `<@${interaction.user.id}> ${mencoes}`,
    flags: CV2,
    components: [
      container([txt(`# ${cat.emoji} ${cat.label}\n\nOlá <@${interaction.user.id}>! A equipe de suporte irá te atender em breve.\n\n**Categoria:** ${cat.emoji} ${cat.label}\n**Descrição:** ${cat.description}\n\nDescreva sua situação com o máximo de detalhes possível.\n\n⏰ Horário de atendimento: **08:00 às 22:00**`)]),
      rowBotoesTicket(),
    ],
  });
  await followupRaw(interaction, { content: `✅ Ticket aberto em <#${canal.id}>!`, flags: EPH });
}

// ──────────────────────────────────────────────
// SLASH COMMANDS
// ──────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("aviso").setDescription("📢 Envia um aviso oficial no canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o=>o.setName("titulo").setDescription("Título").setRequired(true))
    .addStringOption(o=>o.setName("descricao").setDescription("Descrição").setRequired(true))
    .addChannelOption(o=>o.setName("canal").setDescription("Canal de destino").setRequired(false)),
  new SlashCommandBuilder().setName("ticket").setDescription("🎫 Envia o painel de ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o=>o.setName("canal").setDescription("Canal de destino").setRequired(false)),
  new SlashCommandBuilder().setName("contratar").setDescription("📝 Envia uma proposta de contrato")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName("membro").setDescription("Usuário a contratar").setRequired(true))
    .addStringOption(o=>o.setName("nome_time").setDescription("Nome do time").setRequired(true))
    .addStringOption(o=>o.setName("posicao").setDescription("Posição").setRequired(true))
    .addRoleOption(o=>o.setName("cargo").setDescription("Cargo de time").setRequired(true)),
  new SlashCommandBuilder().setName("contratos-ativos").setDescription("📋 Contratos pendentes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName("historico-contratos").setDescription("📜 Histórico de contratos")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(o=>o.setName("membro").setDescription("Filtrar por membro").setRequired(false)),
  new SlashCommandBuilder().setName("cancelar-contrato").setDescription("🗑️ Cancela um contrato pelo ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(o=>o.setName("contract_id").setDescription("ID do contrato").setRequired(true)),
].map(c=>c.toJSON());

// ──────────────────────────────────────────────
// CLIENT
// ──────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel],
});

process.on("unhandledRejection", err => console.error("[ERROR]", err));

setInterval(async () => {
  if (!rest) return;
  const db=loadDB(), now=Date.now()/1000;
  const exp=Object.entries(db.contracts).filter(([,c])=>c.status==="pending"&&now>c.expires_at);
  for (const [cid,c] of exp) {
    c.status="expired"; db.history.push(c);
    try { if(c.message_id) await editRaw(c.channel_id, c.message_id, payExpirado(c)); } catch {}
    delete db.contracts[cid];
  }
  if (exp.length) { saveDB(db); console.log(`[INFO] ${exp.length} expirado(s).`); }
}, 5*60*1000);

client.on("messageCreate", async msg => {
  if (msg.author.bot || !msg.guild) return;
  const m = msg.guild.members.cache.get(msg.author.id);
  if (m && (CARGOS_SUPORTE.some(id=>m.roles.cache.has(id)) || m.permissions.has(PermissionFlagsBits.Administrator))) return;
  if (LINK_BLOQUEADO.test(msg.content)) {
    try { await msg.delete(); } catch {}
    const av = await msg.channel.send(`🚫 ${msg.author} links de convite do Roblox não são permitidos neste servidor!`);
    setTimeout(()=>av.delete().catch(()=>{}), 5000);
  }
});

// ──────────────────────────────────────────────
// INTERACTIONS
// ──────────────────────────────────────────────
client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === "aviso") {
      await deferRaw(interaction, EPH);
      const titulo    = interaction.options.getString("titulo");
      const descricao = interaction.options.getString("descricao");
      const ch        = interaction.options.getChannel("canal") || interaction.channel;
      await sendRaw(ch.id, { content: "@everyone", flags: CV2, components: [container([txt(`# ${titulo}\n\n${descricao}`), sep(), txt(`*Aviso emitido por ${interaction.user.displayName}*`)])] });
      await editReplyRaw(interaction, { content: `✅ Aviso enviado em <#${ch.id}>!` });
    }

    else if (cmd === "ticket") {
      await deferRaw(interaction, EPH);
      const ch = interaction.options.getChannel("canal") || interaction.channel;
      await sendRaw(ch.id, { flags: CV2, components: [
        container([txt(`# 🎫 | Ajuda e Suporte\n\n**A equipe *WSA* estará sempre pronta para atender o seu ticket, portanto, precisamos que você tenha paciência e calma ao nos relatar.**\n\n─\n\n- 🤔 **Dúvidas** — Perguntas gerais sobre a liga ou o servidor\n- 🤝 **Parcerias** — Propostas de parceria e divulgações\n- 🚨 **Denúncias** — Denunciar algum usuário do servidor\n- 🏆 **Ownar Clube** — Solicitar ownership de um clube\n- 📌 **Outros** — Outros assuntos não listados acima\n\n─\n\n> ⏳ O horário de atendimento do seu ticket será de **8:00 às 22:00**, fora esse horário a equipe não tem obrigação de responde-lo.\n\n*A equipe WSA agradece.*`)]),
        rowSelectTicket(),
      ]});
      await editReplyRaw(interaction, { content: `✅ Painel enviado em <#${ch.id}>!` });
    }

    else if (cmd === "contratar") {
      if (!interaction.member.roles.cache.has(MANAGER_ROLE_ID))
        return replyRaw(interaction, { content: "❌ Você precisa ter o cargo de **Manager**!", flags: EPH });
      const membro=interaction.options.getMember("membro"), nomeTime=interaction.options.getString("nome_time");
      const posicao=interaction.options.getString("posicao"), cargo=interaction.options.getRole("cargo");
      if (membro.user.bot) return replyRaw(interaction, { content: "❌ Não pode contratar um bot.", flags: EPH });
      if (membro.id===interaction.user.id) return replyRaw(interaction, { content: "❌ Não pode contratar a si mesmo.", flags: EPH });
      if (!CARGOS_TIMES.includes(cargo.id)) return replyRaw(interaction, { content: `❌ Cargo inválido!\n**Cargos permitidos:**\n${CARGOS_TIMES.map(id=>`<@&${id}>`).join("\n")}`, flags: EPH });
      const contractId=gerarContractId(membro.id,interaction.user.id), now=Date.now()/1000;
      const c={ contract_id:contractId, signee_id:membro.id, signee_name:membro.user.username, contractor_id:interaction.user.id, contractor_name:interaction.user.username, team:nomeTime, position:posicao, role:cargo.name, role_id:cargo.id, status:"pending", created_at:now, expires_at:now+CONTRACT_EXPIRY_H*3600, message_id:null, channel_id:CANAL_CONTRATOS_ID };
      const db=loadDB(); db.contracts[contractId]=c; saveDB(db);
      await replyRaw(interaction, { content: "✅ Contrato enviado!", flags: EPH });
      const pay=payContratoPendente(c);
      const msg=await sendRaw(CANAL_CONTRATOS_ID, { content:`<@${membro.id}>, você recebeu uma proposta de contrato de <@${interaction.user.id}>!`, ...pay });
      const db2=loadDB(); if(db2.contracts[contractId]){ db2.contracts[contractId].message_id=msg.id; saveDB(db2); }
    }

    else if (cmd === "contratos-ativos") {
      if (!interaction.member.roles.cache.has(MANAGER_ROLE_ID)&&!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return replyRaw(interaction, { content: "❌ Sem permissão.", flags: EPH });
      const db=loadDB(), pending=Object.values(db.contracts).filter(c=>c.status==="pending");
      if (!pending.length) return replyRaw(interaction, { content: "✅ Nenhum contrato pendente.", flags: EPH });
      const linhas=pending.map(c=>`🔸 **${c.team}** — ${c.position}\n<@${c.signee_id}> ← <@${c.contractor_id}>\nExpira: \`${new Date(c.expires_at*1000).toLocaleString("pt-BR")}\``).join("\n\n");
      await replyRaw(interaction, { flags:CV2|EPH, components:[container([txt(`## ⏳ Contratos Pendentes — WSA League\n\n${linhas}`)])] });
    }

    else if (cmd === "historico-contratos") {
      const db=loadDB(); let hist=db.history||[];
      const u=interaction.options.getUser("membro");
      if(u) hist=hist.filter(c=>c.signee_id===u.id||c.contractor_id===u.id);
      if(!hist.length) return replyRaw(interaction, { content:"📭 Nenhum contrato encontrado.", flags:EPH });
      const emj={accepted:"✅",declined:"❌",expired:"⏰",cancelled:"🗑️"};
      const linhas=hist.slice(-10).reverse().map(c=>`${emj[c.status]||"❓"} **${c.team||"—"}** — ${c.position||"—"}\n<@${c.signee_id}> ← <@${c.contractor_id}> \`${c.status.toUpperCase()}\``).join("\n\n");
      await replyRaw(interaction, { flags:CV2|EPH, components:[container([txt(`## 📋 Histórico de Contratos — WSA League\n\n${linhas}`)])] });
    }

    else if (cmd === "cancelar-contrato") {
      const cid=interaction.options.getString("contract_id"), db=loadDB(), c=db.contracts[cid];
      if(!c) return replyRaw(interaction, { content:"❌ Contrato não encontrado.", flags:EPH });
      const ok=interaction.user.id===c.contractor_id||interaction.member.roles.cache.has(MANAGER_ROLE_ID)||interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if(!ok) return replyRaw(interaction, { content:"❌ Apenas quem enviou pode cancelar.", flags:EPH });
      c.status="cancelled"; db.history.push(c); delete db.contracts[cid]; saveDB(db);
      await replyRaw(interaction, { content:`🗑️ Contrato \`${cid}\` cancelado.`, flags:EPH });
    }
  }

  else if (interaction.isButton()) {
    const id = interaction.customId;

    if (id==="btn_aceitar_contrato") {
      const db=loadDB(), c=Object.values(db.contracts).find(x=>x.message_id===interaction.message.id);
      if(!c) return replyRaw(interaction,{content:"❌ Contrato não encontrado.",flags:EPH});
      if(interaction.user.id!==c.signee_id) return replyRaw(interaction,{content:"❌ Apenas o contratado pode aceitar.",flags:EPH});
      if(c.status!=="pending") return replyRaw(interaction,{content:"⚠️ Contrato já processado.",flags:EPH});
      if(Date.now()/1000>c.expires_at) return replyRaw(interaction,{content:"⏰ Contrato expirado.",flags:EPH});
      c.status="accepted"; c.answered_at=Date.now()/1000; db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      const member=interaction.guild.members.cache.get(c.signee_id), role=interaction.guild.roles.cache.get(String(c.role_id));
      if(member&&role) await member.roles.add(role).catch(()=>{});
      await editRaw(interaction.channelId, interaction.message.id, payAceito(c));
      await replyRaw(interaction, { content:`🎉 <@${interaction.user.id}> aceitou o contrato e foi contratado para o time **${c.team}**!` });
    }

    else if (id==="btn_recusar_contrato") {
      const db=loadDB(), c=Object.values(db.contracts).find(x=>x.message_id===interaction.message.id);
      if(!c) return replyRaw(interaction,{content:"❌ Contrato não encontrado.",flags:EPH});
      if(interaction.user.id!==c.signee_id) return replyRaw(interaction,{content:"❌ Apenas o contratado pode recusar.",flags:EPH});
      if(c.status!=="pending") return replyRaw(interaction,{content:"⚠️ Contrato já processado.",flags:EPH});
      c.status="declined"; c.answered_at=Date.now()/1000; db.history.push(c); delete db.contracts[c.contract_id]; saveDB(db);
      await editRaw(interaction.channelId, interaction.message.id, payRecusado(c));
      await replyRaw(interaction, { content:`❌ <@${interaction.user.id}> recusou o contrato.` });
    }

    else if (id==="btn_fechar_ticket") {
      const ehS=CARGOS_SUPORTE.some(id=>interaction.member.roles.cache.has(id)), ehA=interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if(!ehS&&!ehA) return replyRaw(interaction,{content:"❌ Apenas a staff pode fechar o ticket!",flags:EPH});
      ticketsAssumidos.delete(interaction.channelId);
      const donoId=pegarDonoId(interaction.channel.topic||""), canalNome=interaction.channel.name;
      await replyRaw(interaction,{flags:CV2,components:[container([txt(`🔒 Ticket fechado por <@${interaction.user.id}>.\nO canal será deletado em **5 segundos**.`)],0xFF4444)]});
      if(donoId) {
        try { await dmRaw(donoId,{flags:CV2,components:[container([txt(`## 🔒 Seu Ticket Foi Encerrado\n\n**Ticket:** \`${canalNome}\`\n**Fechado por:** <@${interaction.user.id}>\n**Data:** ${new Date().toLocaleString("pt-BR")}\n\n⭐ **Como foi o nosso atendimento?**\nClique em uma estrela abaixo e escreva o motivo da sua nota:`)]),rowAvaliacao()]}); } catch {}
      }
      setTimeout(()=>interaction.channel.delete().catch(()=>{}),5000);
    }

    else if (id==="btn_painel_membro") {
      if(CARGOS_SUPORTE.some(id=>interaction.member.roles.cache.has(id))) return replyRaw(interaction,{content:"❌ Este painel é exclusivo para membros!",flags:EPH});
      await replyRaw(interaction,{flags:CV2|EPH,components:[container([txt("👤 **Painel Membro**\n\nUse as opções abaixo para interagir com a staff:")],0x5865F2),rowSelectMembro()]});
    }

    else if (id==="btn_painel_staff") {
      const ehS=CARGOS_SUPORTE.some(id=>interaction.member.roles.cache.has(id));
      if(!ehS&&!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return replyRaw(interaction,{content:"❌ Este painel é exclusivo para a staff!",flags:EPH});
      await replyRaw(interaction,{flags:CV2|EPH,components:[container([txt("👮 **Painel Staff**\n\nUse as opções abaixo para interagir com o membro:")]),rowSelectStaff()]});
    }

    else if (id.startsWith("confirmar_ticket:")) {
      await deferUpdateRaw(interaction);
      await criarCanalTicket(interaction, id.split(":")[1]);
    }

    else if (id==="cancelar_ticket") {
      await updateRaw(interaction,{content:"❌ Abertura de ticket cancelada.",components:[],flags:EPH});
    }

    else if (id.startsWith("aval_")) {
      const nota=parseInt(id.split("_")[1]);
      await showModalRaw(interaction,{
        custom_id:`modal_aval:${nota}:${interaction.user.id}`,
        title:`Avaliação — ${"⭐".repeat(nota)}`,
        components:[{type:1,components:[{type:4,custom_id:"comentario",label:"Por que você deu essa nota?",style:2,placeholder:"Descreva sua experiência...",required:true,max_length:500}]}],
      });
    }
  }

  else if (interaction.isStringSelectMenu()) {
    const {customId,values}=interaction;

    if(customId==="ticket_select") {
      await replyRaw(interaction,{flags:CV2|EPH,components:[
        container([txt("## 📋 Regras do Canal de Tickets\n\n- Abra tickets apenas quando necessário\n- Explique o assunto de forma clara e objetiva\n- Não faça spam nem cobre respostas da staff\n- Tickets sem resposta por **12 horas** serão fechados\n- Mantenha o respeito em todas as situações\n- Em denúncias, envie provas *(prints, vídeos, links)*\n- Em denúncias por racismo, o usuário precisa estar no servidor\n\n⚠️ O descumprimento pode resultar em fechamento do ticket ou punições."),{type:11,items:[{media:{url:REGRAS_IMG}}]}]),
        rowConfirmar(values[0]),
      ]});
    }

    else if(customId==="painel_membro_select"&&values[0]==="notificar_staff") {
      const cid=interaction.channelId;
      if(ticketsAssumidos.has(cid)) await replyRaw(interaction,{content:`🔔 <@${interaction.user.id}> está chamando o responsável!\n<@${ticketsAssumidos.get(cid)}>, o membro precisa de você!`});
      else await replyRaw(interaction,{content:`🔔 <@${interaction.user.id}> está chamando a staff!\n${CARGOS_SUPORTE.map(id=>`<@&${id}>`).join(" ")}`});
    }

    else if(customId==="painel_staff_select") {
      if(values[0]==="notificar_membro") {
        const donoId=pegarDonoId(interaction.channel.topic||""), mencao=donoId?`<@${donoId}>`:"membro";
        await replyRaw(interaction,{content:`📣 <@${interaction.user.id}> está chamando o ${mencao}!\n${mencao}, a staff precisa de você no ticket!`});
      } else if(values[0]==="assumir_ticket") {
        const cid=interaction.channelId;
        if(ticketsAssumidos.has(cid)){const rid=ticketsAssumidos.get(cid);return replyRaw(interaction,{content:rid===interaction.user.id?"⚠️ Você já é o responsável!":`⚠️ Este ticket já foi assumido por <@${rid}>!`,flags:EPH});}
        ticketsAssumidos.set(cid,interaction.user.id);
        const donoId=pegarDonoId(interaction.channel.topic||""), mencao=donoId?`<@${donoId}>`:"";
        await replyRaw(interaction,{content:`✋ <@${interaction.user.id}> assumiu este ticket!\n${mencao} seu ticket agora está sendo atendido por <@${interaction.user.id}>.`});
      }
    }
  }

  else if(interaction.isModalSubmit()) {
    if(interaction.customId.startsWith("modal_aval:")) {
      const parts=interaction.customId.split(":"), nota=parseInt(parts[1]), donoId=parts[2];
      const comentario=interaction.fields.getTextInputValue("comentario");
      const estrelas="⭐".repeat(nota)+"✩".repeat(5-nota);
      const descricoes=["Muito ruim 😞","Ruim 😕","Regular 😐","Bom 😊","Excelente! 🎉"];
      const cores=[0xFF4444,0xFF8C00,0xFFD700,0x90EE90,0x2ECC71];
      await sendRaw(CANAL_LOGS_AVAL,{flags:CV2,components:[container([txt(`## ⭐ Nova Avaliação de Ticket\n\n**Usuário:** <@${donoId}>\n**Nota:** ${estrelas} \`${nota}/5\` — ${descricoes[nota-1]}\n\n**Comentário:**\n> ${comentario}\n\n*${new Date().toLocaleString("pt-BR")}*`)],cores[nota-1])]});
      await replyRaw(interaction,{content:"✅ Obrigado pela sua avaliação!",flags:EPH});
    }
  }
});

// ──────────────────────────────────────────────
// READY
// ──────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ Bot online como: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log(`📡 Comandos sincronizados na guild ${GUILD_ID}`);
  } catch(e) { console.error("Erro ao sincronizar:", e); }
  client.user.setActivity("WSA League", { type: 3 });
});

client.login(TOKEN);