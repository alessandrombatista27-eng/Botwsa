import discord
from discord import app_commands
from discord.ext import commands, tasks
import datetime
import json
import os
import time

# ──────────────────────────────────────────────
# CONFIGURAÇÃO
# ──────────────────────────────────────────────
import os

TOKEN    = os.getenv("DISCORD_TOKEN")  # defina a variável de ambiente DISCORD_TOKEN
GUILD_ID = 1482896148502020206

LOGO_URL = (
    "https://cdn.discordapp.com/attachments/1482886716393001052"
    "/1484316968772304976/RJFCQ35-removebg-preview.png"
    "?ex=69bdc966&is=69bc77e6"
    "&hm=6954fecdcfae88d6c370a96f2297b539e092be7ed015b2e1ff2548c5a7c8933d&"
)

# ── Tickets
CARGOS_SUPORTE = [
    1483576832585367572,
    1483576833600393317,
    1483576834544369794,
]
CATEGORIA_TICKETS_ID = 1483980064910606386

# ── Contratação
MANAGER_ROLE_ID      = 1483576846233764042  # cargo que pode contratar
CANAL_CONTRATOS_ID   = 1483577088568201408  # canal onde os contratos são enviados
CONTRACT_EXPIRY_HOURS = 24
DB_FILE = "contracts.json"

CATEGORIAS = {
    "duvidas":     {"label": "Dúvidas",    "description": "Perguntas gerais sobre a liga ou o servidor.", "emoji": "🤔"},
    "parcerias":   {"label": "Parcerias",   "description": "Propostas de parceria e divulgações.",         "emoji": "🤝"},
    "denuncias":   {"label": "Denúncias",   "description": "Denunciar algum usuário do servidor.",         "emoji": "🚨"},
    "ownar_clube": {"label": "Ownar Clube", "description": "Solicitar ownership de um clube.",             "emoji": "🏆"},
    "outros":      {"label": "Outros",      "description": "Outros assuntos não listados acima.",          "emoji": "📌"},
}

tickets_assumidos: dict[int, int] = {}

# ──────────────────────────────────────────────
# BOT
# ──────────────────────────────────────────────
intents = discord.Intents.default()
intents.guilds  = True
intents.members = True
bot = commands.Bot(command_prefix="!", intents=intents)


# ══════════════════════════════════════════════
# BANCO DE DADOS — CONTRATOS
# ══════════════════════════════════════════════
def load_db():
    if not os.path.exists(DB_FILE):
        return {"contracts": {}, "history": []}
    with open(DB_FILE, "r") as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

def gerar_contract_id(signee_id, contractor_id):
    ts = int(time.time() * 1000)
    return f"WSA{signee_id}_{contractor_id}_{ts}"


# ══════════════════════════════════════════════
# EMBEDS — CONTRATOS
# ══════════════════════════════════════════════
def embed_contrato_pendente(c: dict) -> discord.Embed:
    embed = discord.Embed(color=0xFF6600)
    embed.set_author(name="📋 Proposta de Contrato — WSA League", icon_url=LOGO_URL)
    embed.add_field(name="Contratado",   value=f"<@{c['signee_id']}>\n`{c['signee_name']}`",         inline=True)
    embed.add_field(name="Contratante",  value=f"<@{c['contractor_id']}>\n`{c['contractor_name']}`", inline=True)
    embed.add_field(name="Contract ID",  value=f"`{c['contract_id']}`",                               inline=True)
    embed.add_field(name="Time",         value=c.get("team", "—"),                                    inline=True)
    embed.add_field(name="Posição",      value=c.get("position", "—"),                                inline=True)
    embed.add_field(name="Cargo",        value=c.get("role", "—"),                                    inline=True)
    issued  = datetime.datetime.fromtimestamp(c["created_at"]).strftime("%d/%m/%Y %H:%M")
    expires = datetime.datetime.fromtimestamp(c["expires_at"]).strftime("%d/%m/%Y %H:%M")
    embed.set_footer(text=f"WSA League  •  Emitido: {issued}  •  Expira: {expires}")
    return embed

def embed_aceito(c: dict) -> discord.Embed:
    embed = discord.Embed(
        color=0x2ECC71, title="✅ Contrato Aceito",
        description=f"<@{c['signee_id']}> aceitou o contrato e agora faz parte do time **{c.get('team','—')}**!"
    )
    embed.add_field(name="Contratado",  value=f"<@{c['signee_id']}>\n`{c['signee_name']}`",         inline=True)
    embed.add_field(name="Contratante", value=f"<@{c['contractor_id']}>\n`{c['contractor_name']}`", inline=True)
    embed.add_field(name="Contract ID", value=f"`{c['contract_id']}`",                               inline=True)
    embed.set_footer(text="WSA League")
    return embed

def embed_recusado(c: dict) -> discord.Embed:
    embed = discord.Embed(
        color=0x95A5A6, title="❌ Contrato Recusado",
        description=f"<@{c['signee_id']}> recusou a proposta de contrato."
    )
    embed.add_field(name="Contratado",  value=f"<@{c['signee_id']}>\n`{c['signee_name']}`",         inline=True)
    embed.add_field(name="Contratante", value=f"<@{c['contractor_id']}>\n`{c['contractor_name']}`", inline=True)
    embed.add_field(name="Contract ID", value=f"`{c['contract_id']}`",                               inline=True)
    embed.set_footer(text="WSA League")
    return embed

def embed_expirado(c: dict) -> discord.Embed:
    embed = discord.Embed(
        color=0x992D22, title="⏰ Contrato Expirado",
        description="Este contrato expirou. Peça ao manager para enviar uma nova proposta."
    )
    embed.add_field(name="Contratado",  value=f"<@{c['signee_id']}>\n`{c['signee_name']}`",         inline=True)
    embed.add_field(name="Contratante", value=f"<@{c['contractor_id']}>\n`{c['contractor_name']}`", inline=True)
    embed.add_field(name="Contract ID", value=f"`{c['contract_id']}`",                               inline=True)
    embed.set_footer(text="WSA League")
    return embed


# ══════════════════════════════════════════════
# VIEW — ACEITAR / RECUSAR CONTRATO
# ══════════════════════════════════════════════
class ContratoView(discord.ui.View):
    def __init__(self, contract_id: str, signee_id: int, contractor_id: int):
        super().__init__(timeout=None)
        self.contract_id   = contract_id
        self.signee_id     = signee_id
        self.contractor_id = contractor_id

    @discord.ui.button(label="✅  Aceitar", style=discord.ButtonStyle.success, custom_id="btn_aceitar_contrato")
    async def aceitar(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.signee_id:
            await interaction.response.send_message("❌ Apenas o contratado pode aceitar este contrato.", ephemeral=True)
            return

        db = load_db()
        c  = db["contracts"].get(self.contract_id)
        if not c:
            await interaction.response.send_message("❌ Contrato não encontrado.", ephemeral=True)
            return
        if c["status"] != "pending":
            await interaction.response.send_message("⚠️ Este contrato já foi processado.", ephemeral=True)
            return
        if time.time() > c["expires_at"]:
            await interaction.response.send_message("⏰ Este contrato já expirou.", ephemeral=True)
            return

        c["status"] = "accepted"
        c["answered_at"] = time.time()
        db["history"].append(c)
        del db["contracts"][self.contract_id]
        save_db(db)

        # Dar cargo
        guild  = interaction.guild
        member = guild.get_member(self.signee_id)
        role   = guild.get_role(c["role_id"]) if c.get("role_id") else None
        if member and role:
            await member.add_roles(role)

        await interaction.message.edit(embed=embed_aceito(c), view=None)
        await interaction.response.send_message(f"🎉 {interaction.user.mention} aceitou o contrato e foi contratado para o time **{c.get('team','—')}**!")

    @discord.ui.button(label="❌  Recusar", style=discord.ButtonStyle.danger, custom_id="btn_recusar_contrato")
    async def recusar(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.signee_id:
            await interaction.response.send_message("❌ Apenas o contratado pode recusar este contrato.", ephemeral=True)
            return

        db = load_db()
        c  = db["contracts"].get(self.contract_id)
        if not c:
            await interaction.response.send_message("❌ Contrato não encontrado.", ephemeral=True)
            return
        if c["status"] != "pending":
            await interaction.response.send_message("⚠️ Este contrato já foi processado.", ephemeral=True)
            return

        c["status"] = "declined"
        c["answered_at"] = time.time()
        db["history"].append(c)
        del db["contracts"][self.contract_id]
        save_db(db)

        await interaction.message.edit(embed=embed_recusado(c), view=None)
        await interaction.response.send_message(f"❌ {interaction.user.mention} recusou o contrato.")


# ══════════════════════════════════════════════
# TASK — CHECAR CONTRATOS EXPIRADOS
# ══════════════════════════════════════════════
@tasks.loop(minutes=5)
async def checar_contratos_expirados():
    db  = load_db()
    now = time.time()
    expirados = [cid for cid, c in db["contracts"].items() if c["status"] == "pending" and now > c["expires_at"]]

    for cid in expirados:
        c = db["contracts"][cid]
        c["status"] = "expired"
        db["history"].append(c)

        try:
            channel = bot.get_channel(c["channel_id"])
            if channel and c.get("message_id"):
                msg = await channel.fetch_message(c["message_id"])
                await msg.edit(embed=embed_expirado(c), view=None)
        except Exception as e:
            print(f"[WARN] Não foi possível editar contrato expirado {cid}: {e}")

        del db["contracts"][cid]

    if expirados:
        save_db(db)
        print(f"[INFO] {len(expirados)} contrato(s) expirado(s).")


# ══════════════════════════════════════════════
# SISTEMA DE TICKETS
# ══════════════════════════════════════════════

# ── Modal de avaliação (comentário)
class AvaliacaoModal(discord.ui.Modal):
    def __init__(self, nota: int, dono_id: int, canal_nome: str):
        super().__init__(title=f"Avaliação — {nota} {'⭐' * nota}")
        self.nota       = nota
        self.dono_id    = dono_id
        self.canal_nome = canal_nome

    comentario = discord.ui.TextInput(
        label="Por que você deu essa nota?",
        placeholder="Descreva brevemente sua experiência com o atendimento...",
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=500,
    )

CANAL_LOGS_AVALIACOES = 1484560745919414354

# ── Modal de avaliação (comentário)
class AvaliacaoModal(discord.ui.Modal):
    def __init__(self, nota: int, dono_id: int, canal_nome: str):
        super().__init__(title=f"Avaliação — {nota} {'⭐' * nota}")
        self.nota       = nota
        self.dono_id    = dono_id
        self.canal_nome = canal_nome

    comentario = discord.ui.TextInput(
        label="Por que você deu essa nota?",
        placeholder="Descreva brevemente sua experiência com o atendimento...",
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=500,
    )

    async def on_submit(self, interaction: discord.Interaction):
        estrelas     = "⭐" * self.nota + "✩" * (5 - self.nota)
        cor          = [0xFF4444, 0xFF8C00, 0xFFD700, 0x90EE90, 0x2ECC71][self.nota - 1]
        descricao    = ["Muito ruim 😞", "Ruim 😕", "Regular 😐", "Bom 😊", "Excelente! 🎉"][self.nota - 1]

        embed = discord.Embed(
            title="⭐ Nova Avaliação de Ticket",
            description=(
                f"**Ticket:** `{self.canal_nome}`\n"
                f"**Usuário:** <@{self.dono_id}>\n"
                f"**Nota:** {estrelas}  `{self.nota}/5` — {descricao}\n\n"
                f"**Comentário:**\n> {self.comentario.value}"
            ),
            color=cor,
            timestamp=datetime.datetime.now(datetime.timezone.utc),
        )
        embed.set_footer(text="WSA League • Avaliações de Tickets")

        guild = interaction.client.get_guild(GUILD_ID)
        if guild:
            canal_log = guild.get_channel(CANAL_LOGS_AVALIACOES)
            if canal_log:
                await canal_log.send(embed=embed)

        await interaction.response.send_message("✅ Obrigado pela sua avaliação!", ephemeral=True)


# ── View de avaliação com botões de estrela (enviada por DM)
class AvaliacaoView(discord.ui.View):
    def __init__(self, dono_id: int, canal_nome: str, guild_id: int):
        super().__init__(timeout=300)
        self.dono_id    = dono_id
        self.canal_nome = canal_nome
        self.guild_id   = guild_id

    async def _avaliar(self, interaction: discord.Interaction, nota: int):
        await interaction.response.send_modal(AvaliacaoModal(nota, self.dono_id, self.canal_nome))
        self.stop()

    @discord.ui.button(label="⭐ 1", style=discord.ButtonStyle.danger,    custom_id="aval_1")
    async def aval1(self, interaction: discord.Interaction, b: discord.ui.Button): await self._avaliar(interaction, 1)

    @discord.ui.button(label="⭐ 2", style=discord.ButtonStyle.danger,    custom_id="aval_2")
    async def aval2(self, interaction: discord.Interaction, b: discord.ui.Button): await self._avaliar(interaction, 2)

    @discord.ui.button(label="⭐ 3", style=discord.ButtonStyle.secondary, custom_id="aval_3")
    async def aval3(self, interaction: discord.Interaction, b: discord.ui.Button): await self._avaliar(interaction, 3)

    @discord.ui.button(label="⭐ 4", style=discord.ButtonStyle.success,   custom_id="aval_4")
    async def aval4(self, interaction: discord.Interaction, b: discord.ui.Button): await self._avaliar(interaction, 4)

    @discord.ui.button(label="⭐ 5", style=discord.ButtonStyle.success,   custom_id="aval_5")
    async def aval5(self, interaction: discord.Interaction, b: discord.ui.Button): await self._avaliar(interaction, 5)


# ── Helper: buscar dono do ticket pelo tópico
def pegar_dono_id(topic: str):
    for part in (topic or "").split("|"):
        part = part.strip()
        if part.startswith("ID:"):
            try:
                return int(part.replace("ID:", "").strip())
            except ValueError:
                pass
    return None


class TicketView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="🔒 Fechar Ticket", style=discord.ButtonStyle.danger, custom_id="btn_fechar_ticket", row=0)
    async def fechar_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Apenas staff/admin pode fechar
        eh_suporte = any(r.id in CARGOS_SUPORTE for r in interaction.user.roles)
        eh_admin   = interaction.user.guild_permissions.administrator
        if not (eh_suporte or eh_admin):
            await interaction.response.send_message("❌ Apenas a staff pode fechar o ticket!", ephemeral=True)
            return

        tickets_assumidos.pop(interaction.channel.id, None)

        # Pega o dono do ticket para enviar avaliação
        dono_id    = pegar_dono_id(interaction.channel.topic or "")
        canal_nome = interaction.channel.name

        embed = discord.Embed(
            description=f"🔒 Ticket fechado por {interaction.user.mention}.\nO canal será deletado em **5 segundos**.",
            color=0xFF4444,
        )
        await interaction.response.send_message(embed=embed)

        # Envia DM de avaliação para o dono
        if dono_id:
            try:
                guild  = interaction.guild
                membro = guild.get_member(dono_id)
                if membro:
                    embed_dm = discord.Embed(
                        title="🔒 Seu Ticket Foi Encerrado",
                        description=(
                            f"**Ticket:** `{canal_nome}`\n"
                            f"**Fechado por:** {interaction.user.mention}\n"
                            f"**Data:** {datetime.datetime.now().strftime('%d/%m/%Y, %H:%M')}\n\n"
                            f"⭐ **Como foi o nosso atendimento?**\n"
                            f"Clique em uma estrela abaixo e depois escreva o motivo da sua nota:"
                        ),
                        color=0xFF6600,
                    )
                    embed_dm.set_thumbnail(url=LOGO_URL)
                    embed_dm.set_footer(text="WSA League • Ticket System")
                    await membro.send(embed=embed_dm, view=AvaliacaoView(dono_id, canal_nome, guild.id))
            except Exception:
                pass  # DM desativada, ignora

        await discord.utils.sleep_until(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=5))
        await interaction.channel.delete(reason=f"Ticket fechado por {interaction.user}")

    @discord.ui.button(label="👤 Painel Membro", style=discord.ButtonStyle.secondary, custom_id="btn_painel_membro", row=0)
    async def painel_membro(self, interaction: discord.Interaction, button: discord.ui.Button):
        if any(r.id in CARGOS_SUPORTE for r in interaction.user.roles):
            await interaction.response.send_message("❌ Este painel é exclusivo para membros!", ephemeral=True)
            return
        embed = discord.Embed(description="👤 **Painel Membro**\n\nUse as opções abaixo para interagir com a staff:", color=0x5865F2)
        embed.set_footer(text="WSA — Painel Membro")
        await interaction.response.send_message(embed=embed, view=PainelMembroView(), ephemeral=True)

    @discord.ui.button(label="👮 Painel Staff", style=discord.ButtonStyle.secondary, custom_id="btn_painel_staff", row=0)
    async def painel_staff(self, interaction: discord.Interaction, button: discord.ui.Button):
        eh_suporte = any(r.id in CARGOS_SUPORTE for r in interaction.user.roles)
        if not (eh_suporte or interaction.user.guild_permissions.administrator):
            await interaction.response.send_message("❌ Este painel é exclusivo para a staff!", ephemeral=True)
            return
        embed = discord.Embed(description="👮 **Painel Staff**\n\nUse as opções abaixo para interagir com o membro:", color=0xFF6600)
        embed.set_footer(text="WSA — Painel Staff")
        await interaction.response.send_message(embed=embed, view=PainelStaffView(), ephemeral=True)


class PainelMembroSelect(discord.ui.Select):
    def __init__(self):
        options = [discord.SelectOption(label="Notificar Staff", description="Envia um ping para quem está atendendo o ticket.", emoji="🔔", value="notificar_staff")]
        super().__init__(placeholder="Selecione o que deseja fazer", min_values=1, max_values=1, options=options, custom_id="painel_membro_select")

    async def callback(self, interaction: discord.Interaction):
        canal_id = interaction.channel.id
        if canal_id in tickets_assumidos:
            resp_id = tickets_assumidos[canal_id]
            await interaction.response.send_message(f"🔔 {interaction.user.mention} está chamando o responsável pelo ticket!\n<@{resp_id}>, o membro precisa de você!")
        else:
            mencoes = " ".join(f"<@&{cid}>" for cid in CARGOS_SUPORTE if interaction.guild.get_role(cid))
            await interaction.response.send_message(f"🔔 {interaction.user.mention} está chamando a staff!\n{mencoes}")

class PainelMembroView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(PainelMembroSelect())


class PainelStaffSelect(discord.ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="Notificar Membro", description="Envia um ping para o membro no canal.", emoji="📣", value="notificar_membro"),
            discord.SelectOption(label="Assumir Ticket",   description="Marca você como responsável por este ticket.", emoji="✋", value="assumir_ticket"),
        ]
        super().__init__(placeholder="Selecione o que deseja fazer", min_values=1, max_values=1, options=options, custom_id="painel_staff_select")

    async def callback(self, interaction: discord.Interaction):
        if self.values[0] == "notificar_membro":
            topic = interaction.channel.topic or ""
            dono_id = None
            for part in topic.split("|"):
                part = part.strip()
                if part.startswith("ID:"):
                    try: dono_id = int(part.replace("ID:", "").strip())
                    except ValueError: pass
            mencao = f"<@{dono_id}>" if dono_id else "membro"
            await interaction.response.send_message(f"📣 {interaction.user.mention} está chamando o {mencao}!\n{mencao}, a staff precisa de você no ticket!")

        elif self.values[0] == "assumir_ticket":
            canal_id = interaction.channel.id
            if canal_id in tickets_assumidos:
                resp_id = tickets_assumidos[canal_id]
                msg = "⚠️ Você já é o responsável por este ticket!" if resp_id == interaction.user.id else f"⚠️ Este ticket já foi assumido por <@{resp_id}>!"
                await interaction.response.send_message(msg, ephemeral=True)
                return
            tickets_assumidos[canal_id] = interaction.user.id
            topic = interaction.channel.topic or ""
            dono_id = None
            for part in topic.split("|"):
                part = part.strip()
                if part.startswith("ID:"):
                    try: dono_id = int(part.replace("ID:", "").strip())
                    except ValueError: pass
            mencao = f"<@{dono_id}>" if dono_id else ""
            await interaction.response.send_message(f"✋ {interaction.user.mention} assumiu este ticket e irá te atender!\n{mencao} seu ticket agora está sendo atendido por {interaction.user.mention}.")

class PainelStaffView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(PainelStaffSelect())


class TicketSelect(discord.ui.Select):
    def __init__(self):
        options = [discord.SelectOption(label=cat["label"], description=cat["description"], emoji=cat["emoji"], value=key) for key, cat in CATEGORIAS.items()]
        super().__init__(placeholder="Selecione uma opção:", min_values=1, max_values=1, options=options, custom_id="ticket_select")

    async def callback(self, interaction: discord.Interaction):
        categoria_key = self.values[0]
        embed = discord.Embed(
            description=(
                "## 📋 Regras do Canal de Tickets\n\n"
                "- Abra tickets apenas quando necessário\n"
                "- Explique o assunto de forma clara e objetiva\n"
                "- Não faça spam nem cobre respostas da staff\n"
                "- Tickets sem resposta por **12 horas** serão fechados\n"
                "- Mantenha o respeito em todas as situações\n"
                "- Em denúncias, envie provas *(prints, vídeos, links)*\n"
                "- Em denúncias por racismo, o usuário precisa estar no servidor\n\n"
                "⚠️ O descumprimento pode resultar em fechamento do ticket ou punições."
            ),
            color=0xFF6600,
        )
        embed.set_image(url="https://cdn.discordapp.com/attachments/1483577134206160977/1484355094630895626/content.png?ex=69bdece8&is=69bc9b68&hm=507e43d5d3da932f3f7f6eef09d99f8380faf7e9f5d284a902492cbac5612719&")
        embed.set_footer(text="Só você pode ver esta mensagem")
        await interaction.response.send_message(embed=embed, view=ConfirmarTicketView(categoria_key), ephemeral=True)

class PainelTicketView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(TicketSelect())


class ConfirmarTicketView(discord.ui.View):
    def __init__(self, categoria_key: str):
        super().__init__(timeout=60)
        self.categoria_key = categoria_key

    @discord.ui.button(label="✅ Confirmar e Abrir Ticket", style=discord.ButtonStyle.success)
    async def confirmar(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.stop()
        await interaction.response.defer(ephemeral=True)
        await criar_canal_ticket(interaction, self.categoria_key)

    @discord.ui.button(label="Cancelar", style=discord.ButtonStyle.danger)
    async def cancelar(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.stop()
        await interaction.response.edit_message(content="❌ Abertura de ticket cancelada.", embed=None, view=None)


async def criar_canal_ticket(interaction: discord.Interaction, categoria_key: str):
    guild = interaction.guild
    cat   = CATEGORIAS[categoria_key]
    prefixo    = categoria_key.replace("_", "-")
    nome_canal = f"{prefixo}-{interaction.user.name.lower().replace(' ', '-')}"

    canal_existente = discord.utils.get(guild.text_channels, name=nome_canal)
    if canal_existente:
        await interaction.followup.send(f"❌ Você já tem um ticket aberto em {canal_existente.mention}!", ephemeral=True)
        return

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        interaction.user:   discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
        guild.me:           discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True, read_message_history=True),
    }
    for cargo_id in CARGOS_SUPORTE:
        cargo = guild.get_role(cargo_id)
        if cargo:
            overwrites[cargo] = discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)

    canal_ticket = await guild.create_text_channel(
        name=nome_canal, overwrites=overwrites,
        category=guild.get_channel(CATEGORIA_TICKETS_ID),
        topic=f"Ticket de {interaction.user.display_name} | Categoria: {cat['label']} | ID: {interaction.user.id}",
    )

    mencoes = " ".join(f"<@&{cid}>" for cid in CARGOS_SUPORTE if guild.get_role(cid))
    embed = discord.Embed(
        description=(
            f"# {cat['emoji']} {cat['label']}\n\n"
            f"Olá {interaction.user.mention}! A equipe de suporte irá te atender em breve.\n\n"
            f"**Categoria:** {cat['emoji']} {cat['label']}\n"
            f"**Descrição:** {cat['description']}\n\n"
            f"Descreva sua situação com o máximo de detalhes possível.\n\n"
            f"⏰ Horário de atendimento: **08:00 às 22:00**"
        ),
        color=0xFF6600,
        timestamp=datetime.datetime.now(datetime.timezone.utc),
    )
    embed.set_thumbnail(url=LOGO_URL)
    embed.set_footer(text="WSA League • Suporte")
    await canal_ticket.send(content=f"{interaction.user.mention} {mencoes}", embed=embed, view=TicketView())
    await interaction.followup.send(f"✅ Ticket aberto em {canal_ticket.mention}!", ephemeral=True)


# ══════════════════════════════════════════════
# COMANDOS — TICKETS
# ══════════════════════════════════════════════
@bot.tree.command(name="aviso", description="📢 Envia um aviso oficial no canal")
@app_commands.default_permissions(administrator=True)
@app_commands.describe(titulo="Título do aviso", descricao="Descrição detalhada do aviso", canal="Canal onde o aviso será enviado (padrão: canal atual)")
async def aviso(interaction: discord.Interaction, titulo: str, descricao: str, canal: discord.TextChannel = None):
    perms = interaction.user.guild_permissions
    if not (perms.mention_everyone or perms.manage_messages or perms.administrator):
        await interaction.response.send_message("❌ Você não tem permissão para enviar avisos!", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    canal_alvo = canal or interaction.channel
    embed = discord.Embed(description=f"# {titulo}\n\n{descricao}", color=0xFF6600, timestamp=datetime.datetime.now(datetime.timezone.utc))
    embed.set_thumbnail(url=LOGO_URL)
    embed.set_footer(text=f"Aviso emitido por {interaction.user.display_name}", icon_url=interaction.user.display_avatar.url)
    await canal_alvo.send(content="@everyone", embed=embed)
    await interaction.followup.send(f"✅ Aviso enviado com sucesso em {canal_alvo.mention}!", ephemeral=True)


@bot.tree.command(name="ticket", description="🎫 Envia o painel de ticket no canal")
@app_commands.default_permissions(administrator=True)
@app_commands.describe(canal="Canal onde o painel será enviado (padrão: canal atual)")
async def ticket(interaction: discord.Interaction, canal: discord.TextChannel = None):
    if not (interaction.user.guild_permissions.manage_channels or interaction.user.guild_permissions.administrator):
        await interaction.response.send_message("❌ Você não tem permissão para configurar tickets!", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    canal_alvo = canal or interaction.channel
    embed = discord.Embed(
        description=(
            "# 🎫 | Ajuda e Suporte\n\n"
            "**A equipe *WSA* estará sempre pronta para atender o seu ticket, "
            "portanto, precisamos que você tenha paciência e calma ao nos relatar.**\n\n"
            "─\n\n"
            "- 🤔 **Dúvidas** — Perguntas gerais sobre a liga ou o servidor\n"
            "- 🤝 **Parcerias** — Propostas de parceria e divulgações\n"
            "- 🚨 **Denúncias** — Denunciar algum usuário do servidor\n"
            "- 🏆 **Ownar Clube** — Solicitar ownership de um clube\n"
            "- 📌 **Outros** — Outros assuntos não listados acima\n\n"
            "─\n\n"
            "> ⏳ O horário de atendimento do seu ticket será de **8:00 às 22:00**, "
            "fora esse horário a equipe não tem obrigação de responde-lo.\n\n"
            "*A equipe WSA agradece.*"
        ),
        color=0xFF6600,
    )
    embed.set_thumbnail(url=LOGO_URL)
    embed.set_footer(text="WSA League • Suporte")
    await canal_alvo.send(embed=embed, view=PainelTicketView())
    await interaction.followup.send(f"✅ Painel de ticket enviado em {canal_alvo.mention}!", ephemeral=True)


# ══════════════════════════════════════════════
# COMANDOS — CONTRATAÇÃO
# ══════════════════════════════════════════════
# Cargos de times permitidos no /contratar
CARGOS_TIMES = [
    1484546866233344111,
    1484546933115715636,
    1484546961184129024,
    1484546994797023313,
    1484547020260905130,
    1484547051889885356,
    1484547078624514131,
    1484547111264456797,
]

@bot.tree.command(name="contratar", description="📝 Envia uma proposta de contrato para um membro")
@app_commands.default_permissions(manage_roles=True)
@app_commands.describe(
    membro="O usuário que você quer contratar",
    nome_time="Nome do time",
    posicao="Posição (ex: Atacante, Goleiro...)",
    cargo="Cargo de time que será dado ao contratado",
)
async def contratar(interaction: discord.Interaction, membro: discord.Member, nome_time: str, posicao: str, cargo: discord.Role):
    manager_role = interaction.guild.get_role(MANAGER_ROLE_ID)
    tem_cargo    = manager_role is not None and manager_role in interaction.user.roles
    if not tem_cargo:
        await interaction.response.send_message("❌ Você precisa ter o cargo de **Manager** para contratar membros!", ephemeral=True)
        return
    if membro.bot:
        await interaction.response.send_message("❌ Você não pode contratar um bot.", ephemeral=True)
        return
    if membro.id == interaction.user.id:
        await interaction.response.send_message("❌ Você não pode contratar a si mesmo.", ephemeral=True)
        return
    if cargo.id not in CARGOS_TIMES:
        cargos_mencoes = "\n".join(f"<@&{cid}>" for cid in CARGOS_TIMES if interaction.guild.get_role(cid))
        await interaction.response.send_message(
            f"❌ O cargo selecionado não é um cargo de time válido!\n\n**Cargos permitidos:**\n{cargos_mencoes}",
            ephemeral=True,
        )
        return

    contract_id = gerar_contract_id(membro.id, interaction.user.id)
    now         = time.time()
    expires_at  = now + (CONTRACT_EXPIRY_HOURS * 3600)

    c = {
        "contract_id":    contract_id,
        "signee_id":      membro.id,
        "signee_name":    membro.name,
        "contractor_id":  interaction.user.id,
        "contractor_name": interaction.user.name,
        "team":           nome_time,
        "position":       posicao,
        "role":           cargo.name,
        "role_id":        cargo.id,
        "status":         "pending",
        "created_at":     now,
        "expires_at":     expires_at,
        "message_id":     None,
        "channel_id":     CANAL_CONTRATOS_ID,
    }

    db = load_db()
    db["contracts"][contract_id] = c
    save_db(db)

    embed = embed_contrato_pendente(c)
    view  = ContratoView(contract_id, membro.id, interaction.user.id)

    canal_contratos = interaction.guild.get_channel(CANAL_CONTRATOS_ID)
    if canal_contratos is None:
        await interaction.response.send_message("❌ Canal de contratos não encontrado. Verifique o `CANAL_CONTRATOS_ID`.", ephemeral=True)
        return

    if interaction.channel_id != CANAL_CONTRATOS_ID:
        await interaction.response.send_message("✅ Contrato enviado!", ephemeral=True)
        msg = await canal_contratos.send(
            content=f"{membro.mention}, você recebeu uma proposta de contrato de {interaction.user.mention}!",
            embed=embed, view=view,
        )
    else:
        await interaction.response.send_message(
            content=f"{membro.mention}, você recebeu uma proposta de contrato de {interaction.user.mention}!",
            embed=embed, view=view,
        )
        msg = await interaction.original_response()

    db = load_db()
    if contract_id in db["contracts"]:
        db["contracts"][contract_id]["message_id"] = msg.id
        save_db(db)


@bot.tree.command(name="contratos-ativos", description="📋 Veja os contratos pendentes")
@app_commands.default_permissions(manage_roles=True)
async def contratos_ativos(interaction: discord.Interaction):
    manager_role = interaction.guild.get_role(MANAGER_ROLE_ID)
    if manager_role not in interaction.user.roles and not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message("❌ Sem permissão.", ephemeral=True)
        return
    db      = load_db()
    pending = [c for c in db["contracts"].values() if c["status"] == "pending"]
    if not pending:
        await interaction.response.send_message("✅ Nenhum contrato pendente.", ephemeral=True)
        return
    embed = discord.Embed(title="⏳ Contratos Pendentes — WSA League", color=0xFF6600)
    for c in pending:
        expires = datetime.datetime.fromtimestamp(c["expires_at"]).strftime("%d/%m %H:%M")
        embed.add_field(
            name=f"🔸 {c.get('team','—')} — {c['position']}",
            value=f"<@{c['signee_id']}> ← <@{c['contractor_id']}>\nExpira: `{expires}`",
            inline=False,
        )
    await interaction.response.send_message(embed=embed, ephemeral=True)


@bot.tree.command(name="historico-contratos", description="📜 Histórico de contratos do servidor")
@app_commands.default_permissions(manage_roles=True)
@app_commands.describe(membro="Filtrar por membro (opcional)")
async def historico_contratos(interaction: discord.Interaction, membro: discord.Member = None):
    db      = load_db()
    history = db.get("history", [])
    if membro:
        history = [c for c in history if c["signee_id"] == membro.id or c["contractor_id"] == membro.id]
    if not history:
        await interaction.response.send_message("📭 Nenhum contrato encontrado.", ephemeral=True)
        return
    embed = discord.Embed(title="📋 Histórico de Contratos — WSA League", color=0xFF6600)
    for c in list(reversed(history))[:10]:
        emoji = {"accepted": "✅", "declined": "❌", "expired": "⏰", "cancelled": "🗑️"}.get(c["status"], "❓")
        embed.add_field(
            name=f"{emoji} {c.get('team','—')} — {c.get('position','—')}",
            value=f"<@{c['signee_id']}> ← <@{c['contractor_id']}>\n`{c['status'].upper()}`",
            inline=False,
        )
    await interaction.response.send_message(embed=embed, ephemeral=True)


@bot.tree.command(name="cancelar-contrato", description="🗑️ Cancela um contrato pendente pelo ID")
@app_commands.default_permissions(manage_roles=True)
@app_commands.describe(contract_id="ID do contrato a cancelar")
async def cancelar_contrato(interaction: discord.Interaction, contract_id: str):
    db = load_db()
    c  = db["contracts"].get(contract_id)
    if not c:
        await interaction.response.send_message("❌ Contrato não encontrado.", ephemeral=True)
        return
    manager_role = interaction.guild.get_role(MANAGER_ROLE_ID)
    is_contractor = interaction.user.id == c["contractor_id"]
    is_manager    = manager_role in interaction.user.roles or interaction.user.guild_permissions.administrator
    if not (is_contractor or is_manager):
        await interaction.response.send_message("❌ Apenas quem enviou o contrato pode cancelá-lo.", ephemeral=True)
        return
    c["status"] = "cancelled"
    db["history"].append(c)
    del db["contracts"][contract_id]
    save_db(db)
    await interaction.response.send_message(f"🗑️ Contrato `{contract_id}` cancelado com sucesso.", ephemeral=True)


# ══════════════════════════════════════════════
# EVENTO: BOT PRONTO
# ══════════════════════════════════════════════
@bot.event
async def on_ready():
    bot.add_view(TicketView())
    bot.add_view(PainelTicketView())
    bot.add_view(PainelMembroView())
    bot.add_view(PainelStaffView())
    bot.add_view(ContratoView("dummy", 0, 0))

    guild = discord.Object(id=GUILD_ID)

    # Limpa comandos antigos e força resync completo
    bot.tree.clear_commands(guild=guild)
    bot.tree.copy_global_to(guild=guild)
    synced = await bot.tree.sync(guild=guild)

    checar_contratos_expirados.start()
    print(f"✅ Bot online como: {bot.user}")
    print(f"📡 {len(synced)} comandos sincronizados:")
    for cmd in synced:
        print(f"   /{cmd.name}")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="WSA League"))




# ══════════════════════════════════════════════
# INICIAR
# ══════════════════════════════════════════════
bot.run(TOKEN)