import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Plus, UserPlus, X, CheckCircle2,
  RefreshCw, CreditCard, CalendarRange, ShoppingBag,
  History, User, UserCheck, Coins, TrendingUp
} from "lucide-react";
import { Player, Booking, Game, ShopPurchase, GameEvening, type EveningFormat } from "../types.js";

import { EveningsTab } from "./database/EveningsTab.js";
import { BookingsTab } from "./database/BookingsTab.js";
import { DebtsTab } from "./database/DebtsTab.js";
import { GamesTab } from "./database/GamesTab.js";
import { PlayersTab } from "./database/PlayersTab.js";
import { PurchasesTab } from "./database/PurchasesTab.js";
import { AnalyticsTab } from "./database/AnalyticsTab.js";

import { EveningModal } from "./database/EveningModal.js";
import { EveningLedgerModal } from "./database/EveningLedgerModal.js";
import { DebtModal } from "./database/DebtModal.js";
import { BookingModal } from "./database/BookingModal.js";
import { PlayerModal } from "./database/PlayerModal.js";
import { GameModal } from "./database/GameModal.js";
import { PurchaseModal } from "./database/PurchaseModal.js";
import { PlayerDossierModal } from "./database/PlayerDossierModal.js";
import { TelegramExportModal } from "./database/TelegramExportModal.js";

type EditorTab = "evenings" | "bookings" | "debts" | "games" | "players" | "purchases" | "analytics";

export default function DatabaseEditor() {
  const [activeTab, setActiveTab] = useState<EditorTab>("evenings");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEveningFilter, setSelectedEveningFilter] = useState<string>("ALL");

  // Data states
  const [evenings, setEvenings] = useState<GameEvening[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [purchases, setPurchases] = useState<ShopPurchase[]>([]);
  const [_achievementsList, setAchievementsList] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Evening Modal states
  const [editingEvening, setEditingEvening] = useState<GameEvening | null>(null);
  const [ledgerEvening, setLedgerEvening] = useState<GameEvening | null>(null);
  const [showAddEveningModal, setShowAddEveningModal] = useState(false);
  const [eveDate, setEveDate] = useState("");
  const [eveTitle, setEveTitle] = useState("");
  const [eveStatus, setEveStatus] = useState<"Запланирован" | "Идет сейчас" | "Завершен">("Запланирован");
  const [eveLocation, setEveLocation] = useState("Зал #1");
  const [eveNotes, setEveNotes] = useState("");
  const [eveFormat, setEveFormat] = useState<EveningFormat>("STANDARD");

  // Debt adjustment Modal state
  const [editingDebtPlayer, setEditingDebtPlayer] = useState<Player | null>(null);
  const [debtAmountInput, setDebtAmountInput] = useState<number>(0);

  // Player Form states
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [pNickname, setPNickname] = useState("");
  const [pFullName, setPFullName] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pTag, setPTag] = useState("");
  const [pElo, setPElo] = useState(1500);
  const [pGamesPlayed, setPGamesPlayed] = useState(0);
  const [pGamesWon, setPGamesWon] = useState(0);
  const [pTokens, setPTokens] = useState(0);
  const [pDebt, setPDebt] = useState(0);
  const [pAchievements, setPAchievements] = useState<string[]>([]);
  const [pError, setPError] = useState("");

  // CRM Dossier & Telegram Export States
  const [dossierPlayer, setDossierPlayer] = useState<Player | null>(null);
  const [telegramExportModalOpen, setTelegramExportModalOpen] = useState(false);
  const [telegramExportType, setTelegramExportType] = useState<"ANNOUNCEMENT" | "EVENINGS_REPORT" | "DEBTS_LIST">("ANNOUNCEMENT");
  const [telegramExportEvening, setTelegramExportEvening] = useState<GameEvening | null>(null);

  // Booking Form states
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingOldKeys, setBookingOldKeys] = useState<{ nickname: string; date: string } | null>(null);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [bSelectedUserId, setBSelectedUserId] = useState<number>(0);
  const [bNickname, setBNickname] = useState("");
  const [bStatus, setBStatus] = useState<"Вовремя" | "Позже" | "Отмена">("Вовремя");
  const [bDate, setBDate] = useState("");
  const [bPayment, setBPayment] = useState<number>(400);
  const [bPaymentMode, setBPaymentMode] = useState<"preset_100" | "preset_200" | "preset_300" | "preset_400" | "manual">("preset_400");
  const [bPaymentStatus, setBPaymentStatus] = useState<"Оплачено" | "В долг" | "Частично">("Оплачено");

  // Game Form states
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gDate, setGDate] = useState("");
  const [gWinner, setGWinner] = useState<"Красные" | "Чёрные">("Красные");
  const [gProtocol, setGProtocol] = useState("");
  const [gJudge, setGJudge] = useState("");
  const [gGlobalNumber, setGGlobalNumber] = useState(100);

  // Purchase Form states
  const [editingPurchase, setEditingPurchase] = useState<ShopPurchase | null>(null);
  const [purNickname, setPurNickname] = useState("");
  const [purItemName, setPurItemName] = useState("");
  const [purPrice, setPurPrice] = useState(0);
  const [purTimestamp, setPurTimestamp] = useState("");

  // Confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch all database tables
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resPlayers, resBookings, resGames, resPurchases, resAch, resEvenings] = await Promise.all([
        fetch("/api/players").then(r => r.json()),
        fetch("/api/bookings").then(r => r.json()),
        fetch("/api/games").then(r => r.json()),
        fetch("/api/admin/purchases").then(r => r.json()),
        fetch("/api/achievements-list").then(r => r.json()),
        fetch("/api/evenings").then(r => r.json())
      ]);

      setPlayers(resPlayers || []);
      setBookings(resBookings || []);
      setGames(resGames || []);
      setPurchases(resPurchases || []);
      setAchievementsList(resAch || {});
      setEvenings(resEvenings || []);
    } catch (err) {
      console.error("Failed to load admin editor data", err);
      showToast("Ошибка загрузки данных базы");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // ==========================================
  // GAME EVENING CRUD OPERATIONS
  // ==========================================
  const handleOpenAddEvening = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7));
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const defaultDate = `${day}.${month}.${year}`;

    setEveDate(defaultDate);
    setEveTitle(`Пятничный мафия-вечер (${defaultDate})`);
    setEveStatus("Запланирован");
    setEveLocation("Зал #1 (Главный)");
    setEveNotes("");
    setEveFormat("STANDARD");
    setEditingEvening(null);
    setShowAddEveningModal(true);
  };

  const handleOpenEditEvening = (eve: GameEvening) => {
    setEditingEvening(eve);
    setEveDate(eve.date);
    setEveTitle(eve.title);
    setEveStatus(eve.status);
    setEveLocation(eve.location || "Зал #1");
    setEveNotes(eve.notes || "");
    setEveFormat(eve.format || "STANDARD");
    setShowAddEveningModal(true);
  };

  const handleSaveEvening = async () => {
    if (!eveTitle.trim() || !eveDate.trim()) {
      showToast("Заполните название и дату вечера!");
      return;
    }
    try {
      const isEdit = !!editingEvening;
      const url = isEdit ? "/api/admin/evenings" : "/api/evenings";
      const method = isEdit ? "PUT" : "POST";
      const body: any = {
        date: eveDate.trim(),
        title: eveTitle.trim(),
        status: eveStatus,
        location: eveLocation.trim(),
        notes: eveNotes.trim(),
        format: eveFormat
      };
      if (isEdit && editingEvening) {
        body.id = editingEvening.id;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("Ошибка сохранения вечера");
      showToast(isEdit ? "Игровой вечер обновлен" : "Новый игровой вечер создан!");
      setEditingEvening(null);
      setShowAddEveningModal(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Ошибка сервера");
    }
  };

  const handleDeleteEvening = async (eve: GameEvening) => {
    try {
      const res = await fetch(`/api/admin/evenings?id=${eve.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить вечер");
      showToast("Игровой вечер удален");
      setEditingEvening(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // DEBT MANAGEMENT OPERATIONS
  // ==========================================
  const handleClearPlayerDebt = async (player: Player) => {
    try {
      const debtVal = Math.abs(player.debt);
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debt: 0,
          total_paid: player.total_paid + debtVal
        })
      });
      if (!res.ok) throw new Error("Ошибка при списании долга");
      showToast(`Долг игрока ${player.nickname} (${debtVal} ₽) полностью погашен!`);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleOpenEditDebt = (p: Player) => {
    setEditingDebtPlayer(p);
    setDebtAmountInput(Math.abs(p.debt));
  };

  const handleSaveDebtAdjustment = async () => {
    if (!editingDebtPlayer) return;
    try {
      const res = await fetch(`/api/players/${editingDebtPlayer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debt: debtAmountInput > 0 ? -Math.abs(debtAmountInput) : 0
        })
      });
      if (!res.ok) throw new Error("Ошибка при обновлении баланса долга");
      showToast(`Сумма долга для ${editingDebtPlayer.nickname} обновлена`);
      setEditingDebtPlayer(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // PLAYER CRUD OPERATIONS
  // ==========================================
  const handleOpenAddPlayer = () => {
    setPNickname("");
    setPFullName("");
    setPUsername("");
    setPTag("");
    setPElo(1500);
    setPGamesPlayed(0);
    setPGamesWon(0);
    setPTokens(0);
    setPDebt(0);
    setPAchievements([]);
    setPError("");
    setShowAddPlayerModal(true);
  };

  const handleOpenEditPlayer = (p: Player) => {
    setEditingPlayer(p);
    setPNickname(p.nickname);
    setPFullName(p.full_name);
    setPUsername(p.username || "");
    setPTag(p.tag || "");
    setPElo(p.elo);
    setPGamesPlayed(p.games_played);
    setPGamesWon(p.games_won);
    setPTokens(p.tokens);
    setPDebt(p.debt !== 0 ? Math.abs(p.debt) : 0);
    setPAchievements(p.achievements || []);
    setPError("");
  };

  const handleSavePlayer = async () => {
    if (!pNickname.trim()) {
      setPError("Никнейм обязателен!");
      return;
    }
    setPError("");

    const payload = {
      nickname: pNickname.trim(),
      full_name: pFullName.trim(),
      username: pUsername.trim(),
      tag: pTag,
      elo: pElo,
      games_played: pGamesPlayed,
      games_won: pGamesWon,
      tokens: pTokens,
      debt: pDebt > 0 ? -Math.abs(pDebt) : 0,
      achievements: pAchievements
    };

    try {
      const url = editingPlayer ? `/api/players/${editingPlayer.id}` : `/api/admin/players`;
      const method = editingPlayer ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка сохранения");
      }

      showToast(editingPlayer ? "Профиль игрока обновлен" : "Новый игрок добавлен в базу");
      setEditingPlayer(null);
      setShowAddPlayerModal(false);
      fetchData();
    } catch (err: any) {
      setPError(err.message);
    }
  };

  const handleQuickTogglePaymentStatus = async (b: Booking) => {
    const nextStatus = b.payment_status === "Оплачено" ? "В долг" : "Оплачено";
    try {
      const res = await fetch(`/api/admin/bookings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_nickname: b.nickname,
          old_date: b.date,
          nickname: b.nickname,
          date: b.date,
          status: b.status,
          payment: b.payment || 400,
          payment_status: nextStatus
        })
      });
      if (!res.ok) throw new Error("Не удалось быстро сменить статус оплаты");
      showToast(`Статус записи ${b.nickname} изменен на "${nextStatus}"`);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // EVENING LEDGER DISPATCHER HANDLERS
  // ==========================================
  const handleUpdateBookingLedger = async (data: {
    oldNickname: string;
    oldDate: string;
    nickname: string;
    date: string;
    status: "Вовремя" | "Позже" | "Отмена";
    payment: number;
    payment_status: "Оплачено" | "В долг" | "Частично";
  }) => {
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldNickname: data.oldNickname,
          oldDate: data.oldDate,
          nickname: data.nickname,
          date: data.date,
          status: data.status,
          payment: data.payment,
          payment_status: data.payment_status,
        }),
      });
      if (!res.ok) throw new Error(" Ошибка обновления бронирование");
      await fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleAddBookingLedger = async (
    nickname: string,
    date: string,
    payment: number,
    paymentStatus: "Оплачено" | "В долг" | "Частично"
  ) => {
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          date,
          status: "Вовремя",
          payment,
          payment_status: paymentStatus,
        }),
      });
      if (!res.ok) throw new Error("Ошибка добавления игрока на вечер");
      await fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleSettleEveningDebts = async (eveningDate: string, debtMap: { [nickname: string]: number }) => {
    try {
      const res = await fetch("/api/evenings/settle-debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eveningDate, debtMap }),
      });
      if (!res.ok) throw new Error("Ошибка списания долгов");
      showToast("Неоплаченные суммы успешно перенесены в долги игроков!");
      await fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleAddNewPlayerLedger = async (nickname: string, fullName: string) => {
    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          full_name: fullName,
          elo: 1500,
          games_played: 0,
          games_won: 0,
        }),
      });
      if (!res.ok) throw new Error("Не удалось создать игрока");
      const created = await res.json();
      await fetchData();
      return created;
    } catch (err: any) {
      showToast(err.message);
      return null;
    }
  };

  const handleUpdatePlayerDebtFromDossier = async (player: Player, newDebt: number) => {
    try {
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debt: newDebt })
      });
      if (!res.ok) throw new Error("Ошибка обновления долга");
      showToast(`Баланс долга для ${player.nickname} обновлен (${newDebt} ₽)`);
      if (dossierPlayer && dossierPlayer.id === player.id) {
        setDossierPlayer({ ...dossierPlayer, debt: newDebt });
      }
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleUpdatePlayerTokensFromDossier = async (player: Player, newTokens: number) => {
    try {
      const res = await fetch(`/api/players/${player.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: newTokens })
      });
      if (!res.ok) throw new Error("Ошибка обновления жетонов");
      showToast(`Баланс жетонов для ${player.nickname} изменен (${newTokens} 🪙)`);
      if (dossierPlayer && dossierPlayer.id === player.id) {
        setDossierPlayer({ ...dossierPlayer, tokens: newTokens });
      }
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeletePlayer = async (id: number) => {
    try {
      const res = await fetch(`/api/players/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка удаления");
      }
      showToast("Игрок удален из базы данных");
      setEditingPlayer(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // BOOKING CRUD OPERATIONS
  // ==========================================
  const handleOpenAddBooking = (defaultDate?: string) => {
    setBSelectedUserId(0);
    setBNickname("");
    setBStatus("Вовремя");
    if (defaultDate) {
      setBDate(defaultDate);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + ((5 + 7 - d.getDay()) % 7));
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      setBDate(`${day}.${month}.${year}`);
    }
    setBPayment(400);
    setBPaymentMode("preset_400");
    setBPaymentStatus("Оплачено");
    setShowAddBookingModal(true);
  };

  const handleOpenEditBooking = (b: Booking) => {
    setEditingBooking(b);
    setBookingOldKeys({ nickname: b.nickname, date: b.date });
    setBNickname(b.nickname);
    const matched = players.find(p => p.nickname.toLowerCase() === b.nickname.toLowerCase() || p.user_id === b.user_id);
    setBSelectedUserId(matched ? matched.user_id : 0);
    setBStatus((b.status === "Не пришел" ? "Отмена" : b.status) as any);
    setBDate(b.date);
    const payVal = b.payment !== undefined ? b.payment : 400;
    setBPayment(payVal);
    if (payVal === 100) setBPaymentMode("preset_100");
    else if (payVal === 200) setBPaymentMode("preset_200");
    else if (payVal === 300) setBPaymentMode("preset_300");
    else if (payVal === 400) setBPaymentMode("preset_400");
    else setBPaymentMode("manual");
    setBPaymentStatus((b.payment_status === "Не пришел" ? "В долг" : (b.payment_status || "Оплачено")) as any);
  };

  const handleSaveBooking = async () => {
    if (!bNickname.trim() || !bDate.trim()) {
      showToast("Выберите игрока и укажите дату вечера!");
      return;
    }

    try {
      const matchedPlayer = players.find(p => p.user_id === bSelectedUserId) || players.find(p => p.nickname.toLowerCase() === bNickname.trim().toLowerCase());
      const finalUserId = matchedPlayer ? matchedPlayer.user_id : (bSelectedUserId || 9999);

      if (editingBooking && bookingOldKeys) {
        const res = await fetch("/api/admin/bookings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldNickname: bookingOldKeys.nickname,
            oldDate: bookingOldKeys.date,
            user_id: finalUserId,
            nickname: bNickname.trim(),
            status: bStatus,
            date: bDate.trim(),
            payment: bPayment,
            payment_status: bPaymentStatus
          })
        });
        if (!res.ok) throw new Error("Ошибка обновления записи");
        showToast("Запись игрового вечера обновлена");
      } else {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: finalUserId,
            nickname: bNickname.trim(),
            status: bStatus,
            date: bDate.trim(),
            payment: bPayment,
            payment_status: bPaymentStatus
          })
        });
        if (!res.ok) throw new Error("Ошибка создания записи");
        showToast("Игрок успешно записан на вечер");
      }

      if (bPaymentStatus === "В долг" && matchedPlayer) {
        await fetch(`/api/players/${matchedPlayer.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            debt: Math.min(matchedPlayer.debt - bPayment, -bPayment)
          })
        });
      }

      setEditingBooking(null);
      setShowAddBookingModal(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeleteBooking = async (b: Booking) => {
    try {
      const res = await fetch(`/api/admin/bookings?nickname=${encodeURIComponent(b.nickname)}&date=${b.date}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Не удалось удалить запись вечера");
      showToast("Запись игрового вечера удалена");
      setEditingBooking(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // GAME CRUD OPERATIONS
  // ==========================================
  const handleOpenEditGame = (g: Game) => {
    setEditingGame(g);
    setGDate(g.game_date);
    setGWinner(g.winner_label);
    setGProtocol(g.protocol_text);
    setGJudge(g.judge_name);
    setGGlobalNumber(g.global_game_number);
  };

  const handleSaveGame = async () => {
    if (!editingGame) return;
    try {
      const res = await fetch(`/api/admin/games/${editingGame.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_date: gDate,
          winner_label: gWinner,
          protocol_text: gProtocol,
          judge_name: gJudge,
          global_game_number: gGlobalNumber
        })
      });
      if (!res.ok) throw new Error("Ошибка изменения игры");
      showToast("Протокол игры успешно изменен");
      setEditingGame(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeleteGame = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/games/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить игру");
      showToast("Игра удалена из истории");
      setEditingGame(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // ==========================================
  // PURCHASE CRUD OPERATIONS
  // ==========================================
  const handleOpenEditPurchase = (p: ShopPurchase) => {
    setEditingPurchase(p);
    setPurNickname(p.nickname);
    setPurItemName(p.item_name);
    setPurPrice(p.price);
    setPurTimestamp(p.timestamp);
  };

  const handleSavePurchase = async () => {
    if (!editingPurchase) return;
    try {
      const res = await fetch(`/api/admin/purchases/${editingPurchase.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: purNickname,
          item_name: purItemName,
          price: purPrice,
          timestamp: purTimestamp
        })
      });
      if (!res.ok) throw new Error("Ошибка изменения покупки");
      showToast("Транзакция магазина изменена");
      setEditingPurchase(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeletePurchase = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/purchases/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить транзакцию");
      showToast("Транзакция удалена из базы");
      setEditingPurchase(null);
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  // Filters
  const filteredEvenings = evenings.filter(e =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.date.includes(searchQuery) ||
    (e.location && e.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredBookings = bookings.filter(b => {
    const matchSearch = b.nickname.toLowerCase().includes(searchQuery.toLowerCase()) || b.date.includes(searchQuery);
    const matchEvening = selectedEveningFilter === "ALL" || b.date === selectedEveningFilter;
    return matchSearch && matchEvening;
  });

  const debtors = players.filter(p => p.debt < 0 || p.debt > 0);
  const filteredDebtors = debtors.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPlayers = players.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGames = games.filter(g => {
    const matchSearch = g.judge_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.winner_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.protocol_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.game_date.includes(searchQuery);
    const matchEvening = selectedEveningFilter === "ALL" || g.game_date === selectedEveningFilter;
    return matchSearch && matchEvening;
  });

  const filteredPurchases = purchases.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Financial Stats
  const totalClubDebt = debtors.reduce((acc, p) => acc + Math.abs(p.debt), 0);
  const totalCollectedFees = bookings.reduce((acc, b) => acc + (b.payment_status === "Оплачено" ? (b.payment || 400) : 0), 0);

  return (
    <div className="space-y-6">
      {/* Dynamic Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-amber-500 text-slate-950 font-bold px-4 py-3 rounded-xl shadow-neu-flat-amber flex items-center gap-2 border border-amber-400"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800/40 rounded-3xl p-6 md:p-8 shadow-neu-flat">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4.5">
            <div className="w-16 h-16 rounded-2xl bg-amber-600/10 border border-amber-500/35 flex items-center justify-center text-3xl shadow-neu-inset text-amber-400">
              ⚙️
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-tight">
                Панель Управления БД Клуба
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Раздельное управление игровыми вечерами, составами игроков, протоколами и кассой долгов
              </p>
            </div>
          </div>
          
          <button
            onClick={fetchData}
            disabled={loading}
            className="self-start md:self-auto bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white px-4 py-2.5 rounded-2xl text-xs font-mono font-bold text-slate-300 flex items-center gap-2 transition-all shadow-neu-flat hover:shadow-neu-inset cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            ОБНОВИТЬ БАЗУ
          </button>
        </div>

        {/* Quick Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/60">
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 shadow-neu-inset flex items-center gap-3">
            <CalendarRange className="w-6 h-6 text-amber-400" />
            <div>
              <span className="text-[10px] text-slate-400 font-mono block uppercase">Вечеров в базе</span>
              <span className="text-base font-extrabold text-white font-mono">{evenings.length}</span>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 shadow-neu-inset flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-rose-400" />
            <div>
              <span className="text-[10px] text-slate-400 font-mono block uppercase">Общий долг клуба</span>
              <span className="text-base font-extrabold text-rose-400 font-mono">{totalClubDebt} ₽</span>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 shadow-neu-inset flex items-center gap-3">
            <Coins className="w-6 h-6 text-emerald-400" />
            <div>
              <span className="text-[10px] text-slate-400 font-mono block uppercase">Собрано оплат</span>
              <span className="text-base font-extrabold text-emerald-400 font-mono">{totalCollectedFees} ₽</span>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 shadow-neu-inset flex items-center gap-3">
            <User className="w-6 h-6 text-sky-400" />
            <div>
              <span className="text-[10px] text-slate-400 font-mono block uppercase">Игроков в клубе</span>
              <span className="text-base font-extrabold text-white font-mono">{players.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { id: "evenings", label: "Игровые вечера", count: evenings.length, icon: CalendarRange },
          { id: "bookings", label: "Запись & Оплаты", count: bookings.length, icon: UserCheck },
          { id: "debts", label: "Учет долгов", count: debtors.length, icon: CreditCard, highlight: debtors.length > 0 },
          { id: "games", label: "Протоколы игр", count: games.length, icon: History },
          { id: "players", label: "База игроков", count: players.length, icon: User },
          { id: "purchases", label: "Магазин", count: purchases.length, icon: ShoppingBag },
          { id: "analytics", label: "Аналитика & CSV", count: "📊", icon: TrendingUp },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as EditorTab);
                setSearchQuery("");
              }}
              className={`p-4 rounded-2xl border text-left transition-all relative cursor-pointer ${
                isActive
                  ? "bg-slate-900 border-amber-500/40 text-amber-400 shadow-neu-inset font-bold"
                  : "bg-slate-900 border-slate-800/40 text-slate-400 hover:text-slate-200 shadow-neu-flat hover:shadow-neu-inset"
              }`}
            >
              <div className="flex items-center justify-between">
                <tab.icon className={`w-4 h-4 ${isActive ? "text-amber-400" : "text-slate-500"}`} />
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border font-bold ${
                  tab.highlight && !isActive
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : "bg-slate-950/60 border-slate-800/80 text-slate-400"
                }`}>
                  {tab.count}
                </span>
              </div>
              <p className="mt-2 text-xs font-display tracking-tight leading-tight">{tab.label}</p>
            </button>
          );
        })}
      </div>

      {/* Main Table Container */}
      <div className="bg-slate-900 border border-slate-800/40 rounded-3xl overflow-hidden shadow-neu-flat">
        {/* Controls Bar */}
        <div className="p-4 md:p-6 border-b border-slate-800/60 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-950/30">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени, дате или никнейму..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 shadow-neu-inset"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {(activeTab === "bookings" || activeTab === "games") && (
              <div className="w-full sm:w-auto bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5 shadow-neu-inset flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono font-bold uppercase whitespace-nowrap">Вечер:</span>
                <select
                  value={selectedEveningFilter}
                  onChange={(e) => setSelectedEveningFilter(e.target.value)}
                  className="bg-transparent text-xs text-amber-400 font-mono focus:outline-none cursor-pointer w-full"
                >
                  <option value="ALL">Все вечера ({evenings.length})</option>
                  {evenings.map((eve) => (
                    <option key={eve.id} value={eve.date}>
                      {eve.date} — {eve.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {activeTab === "evenings" && (
              <button
                onClick={handleOpenAddEvening}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold uppercase px-4 py-2.5 rounded-2xl shadow-neu-flat-amber flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Создать вечер
              </button>
            )}

            {activeTab === "bookings" && (
              <button
                onClick={() => handleOpenAddBooking(selectedEveningFilter !== "ALL" ? selectedEveningFilter : undefined)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold uppercase px-4 py-2.5 rounded-2xl shadow-neu-flat-amber flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Записать игрока
              </button>
            )}

            {activeTab === "players" && (
              <button
                onClick={handleOpenAddPlayer}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold uppercase px-4 py-2.5 rounded-2xl shadow-neu-flat-amber flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Добавить игрока
              </button>
            )}
          </div>
        </div>

        {/* Tab content view */}
        <div className="overflow-x-auto">
          {activeTab === "evenings" && (
            <EveningsTab
              evenings={filteredEvenings}
              bookings={bookings}
              games={games}
              onSelectEvening={(date) => {
                setSelectedEveningFilter(date);
                setActiveTab("bookings");
              }}
              onOpenLedger={(eve) => setLedgerEvening(eve)}
              onEditEvening={handleOpenEditEvening}
              onExportTelegram={(eve) => {
                setTelegramExportEvening(eve);
                setTelegramExportType(eve.status === "Завершен" ? "EVENINGS_REPORT" : "ANNOUNCEMENT");
                setTelegramExportModalOpen(true);
              }}
            />
          )}

          {activeTab === "bookings" && (
            <BookingsTab
              bookings={filteredBookings}
              players={players}
              onEditBooking={handleOpenEditBooking}
              onQuickTogglePaymentStatus={handleQuickTogglePaymentStatus}
            />
          )}

          {activeTab === "debts" && (
            <DebtsTab
              debtors={filteredDebtors}
              totalClubDebt={totalClubDebt}
              onClearDebt={handleClearPlayerDebt}
              onEditDebt={handleOpenEditDebt}
              onExportDebtsTelegram={() => {
                setTelegramExportEvening(null);
                setTelegramExportType("DEBTS_LIST");
                setTelegramExportModalOpen(true);
              }}
            />
          )}

          {activeTab === "games" && (
            <GamesTab
              games={filteredGames}
              onEditGame={handleOpenEditGame}
            />
          )}

          {activeTab === "players" && (
            <PlayersTab
              players={filteredPlayers}
              onEditPlayer={handleOpenEditPlayer}
              onOpenDossier={(p) => setDossierPlayer(p)}
            />
          )}

          {activeTab === "purchases" && (
            <PurchasesTab
              purchases={filteredPurchases}
              onEditPurchase={handleOpenEditPurchase}
            />
          )}

          {activeTab === "analytics" && (
            <AnalyticsTab
              players={players}
              evenings={evenings}
              bookings={bookings}
              purchases={purchases}
              games={games}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {ledgerEvening && (
          <EveningLedgerModal
            evening={ledgerEvening}
            bookings={bookings}
            games={games}
            players={players}
            onClose={() => setLedgerEvening(null)}
            onUpdateBooking={handleUpdateBookingLedger}
            onAddBooking={handleAddBookingLedger}
            onSettleEveningDebts={handleSettleEveningDebts}
            onAddNewPlayer={handleAddNewPlayerLedger}
          />
        )}

        {(editingEvening || showAddEveningModal) && (
          <EveningModal
            editingEvening={editingEvening}
            eveDate={eveDate}
            setEveDate={setEveDate}
            eveTitle={eveTitle}
            setEveTitle={setEveTitle}
            eveStatus={eveStatus}
            setEveStatus={setEveStatus}
            eveLocation={eveLocation}
            setEveLocation={setEveLocation}
            eveNotes={eveNotes}
            setEveNotes={setEveNotes}
            eveFormat={eveFormat}
            setEveFormat={setEveFormat}
            deleteConfirmId={deleteConfirmId}
            setDeleteConfirmId={setDeleteConfirmId}
            onClose={() => { setEditingEvening(null); setShowAddEveningModal(false); }}
            onSave={handleSaveEvening}
            onDelete={handleDeleteEvening}
          />
        )}

        {editingDebtPlayer && (
          <DebtModal
            editingDebtPlayer={editingDebtPlayer}
            debtAmountInput={debtAmountInput}
            setDebtAmountInput={setDebtAmountInput}
            onClose={() => setEditingDebtPlayer(null)}
            onSave={handleSaveDebtAdjustment}
          />
        )}

        {(editingBooking || showAddBookingModal) && (
          <BookingModal
            editingBooking={editingBooking}
            players={players}
            bSelectedUserId={bSelectedUserId}
            setBSelectedUserId={setBSelectedUserId}
            bNickname={bNickname}
            setBNickname={setBNickname}
            bDate={bDate}
            setBDate={setBDate}
            bStatus={bStatus}
            setBStatus={setBStatus}
            bPayment={bPayment}
            setBPayment={setBPayment}
            bPaymentMode={bPaymentMode}
            setBPaymentMode={setBPaymentMode}
            bPaymentStatus={bPaymentStatus}
            setBPaymentStatus={setBPaymentStatus}
            deleteConfirmId={deleteConfirmId}
            setDeleteConfirmId={setDeleteConfirmId}
            onClose={() => { setEditingBooking(null); setShowAddBookingModal(false); }}
            onSave={handleSaveBooking}
            onDelete={handleDeleteBooking}
          />
        )}

        {(editingPlayer || showAddPlayerModal) && (
          <PlayerModal
            editingPlayer={editingPlayer}
            pNickname={pNickname}
            setPNickname={setPNickname}
            pFullName={pFullName}
            setPFullName={setPFullName}
            pUsername={pUsername}
            setPUsername={setPUsername}
            pTag={pTag}
            setPTag={setPTag}
            pElo={pElo}
            setPElo={setPElo}
            pGamesPlayed={pGamesPlayed}
            setPGamesPlayed={setPGamesPlayed}
            pGamesWon={pGamesWon}
            setPGamesWon={setPGamesWon}
            pTokens={pTokens}
            setPTokens={setPTokens}
            pError={pError}
            deleteConfirmId={deleteConfirmId}
            setDeleteConfirmId={setDeleteConfirmId}
            onClose={() => { setEditingPlayer(null); setShowAddPlayerModal(false); }}
            onSave={handleSavePlayer}
            onDelete={handleDeletePlayer}
          />
        )}

        {dossierPlayer && (
          <PlayerDossierModal
            player={dossierPlayer}
            bookings={bookings}
            purchases={purchases}
            games={games}
            onClose={() => setDossierPlayer(null)}
            onUpdateDebt={handleUpdatePlayerDebtFromDossier}
            onUpdateTokens={handleUpdatePlayerTokensFromDossier}
            onEditProfile={(player) => handleOpenEditPlayer(player)}
          />
        )}

        {telegramExportModalOpen && (
          <TelegramExportModal
            type={telegramExportType.toLowerCase() as any}
            evening={telegramExportEvening || undefined}
            bookings={bookings}
            debtors={debtors}
            onClose={() => setTelegramExportModalOpen(false)}
          />
        )}

        {editingGame && (
          <GameModal
            editingGame={editingGame}
            gDate={gDate}
            setGDate={setGDate}
            gWinner={gWinner}
            setGWinner={setGWinner}
            gJudge={gJudge}
            setGJudge={setGJudge}
            gProtocol={gProtocol}
            setGProtocol={setGProtocol}
            deleteConfirmId={deleteConfirmId}
            setDeleteConfirmId={setDeleteConfirmId}
            onClose={() => setEditingGame(null)}
            onSave={handleSaveGame}
            onDelete={handleDeleteGame}
          />
        )}

        {editingPurchase && (
          <PurchaseModal
            editingPurchase={editingPurchase}
            purNickname={purNickname}
            setPurNickname={setPurNickname}
            purItemName={purItemName}
            setPurItemName={setPurItemName}
            purPrice={purPrice}
            setPurPrice={setPurPrice}
            deleteConfirmId={deleteConfirmId}
            setDeleteConfirmId={setDeleteConfirmId}
            onClose={() => setEditingPurchase(null)}
            onSave={handleSavePurchase}
            onDelete={(id) => handleDeletePurchase(String(id))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
