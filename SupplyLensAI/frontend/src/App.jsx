import { useEffect, useMemo, useRef, useState } from "react";

import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  createConsignment,
  deleteShipment,
  predictRisk,
  getProfile,
  getShipmentAnalysis,
  getWeatherBundle,
  loadPlatformSnapshot,
  login,
  logout,
  optimizeRoute,
  refreshWeather,
  sendChatMessage,
  simulateShipmentScenario,
} from "./api/platform.js";
import LoginPage from "./components/LoginPage.jsx";
import Modal from "./components/Modal.jsx";
import FloatingButton from "./components/nexus/FloatingButton.jsx";
import NexusAssistantPanel from "./components/nexus/NexusAssistantPanel.jsx";
import ToastViewport from "./components/ToastViewport.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LiveMapPage from "./pages/LiveMapPage.jsx";
import NewConsignmentPage from "./pages/NewConsignmentPage.jsx";
import ShipmentsPage from "./pages/ShipmentsPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import { API_BASE, buildWebSocketUrl, normalizeMonthlyTrends } from "./lib/utils.js";

const STORAGE_KEY = "supplylens-auth-token";
const PAGE_REGISTRY = [
  { id: "dashboard", label: "Overview", pageKey: "dashboard" },
  { id: "live_map", label: "Tracking", pageKey: "live_map" },
  { id: "shipments", label: "Shipments", pageKey: "shipments" },
  { id: "alerts", label: "Alerts", pageKey: "alerts" },
  { id: "analytics", label: "Analytics", pageKey: "analytics" },
  { id: "new_consignment", label: "New Consignment", pageKey: "new_consignment" },
  { id: "tracking", label: "Tracking", pageKey: "shipments", hiddenInNav: true },
];

const EMPTY_PLATFORM_DATA = {
  alerts: [],
  aiInsights: { top_risky_shipments: [], predicted_disruptions: [], cost_savings_suggestions: [] },
  carriers: [],
  cities: [],
  kpis: null,
  regions: [],
  shipments: [],
  stats: null,
  trends: [],
  weatherAdvisories: [],
  weatherCities: [],
};

function parseSnapshot(snapshot) {
  const nextState = {};
  const errors = [];

  snapshot.forEach(({ key, result }) => {
    if (result.status !== "fulfilled") {
      errors.push(`${key}: ${result.reason?.message || "Unable to load data"}`);
      return;
    }

    const value = result.value;
    if (key === "shipments") {
      nextState.shipments = Array.isArray(value) ? value : [];
      return;
    }
    if (key === "stats") {
      nextState.stats = value || null;
      return;
    }
    if (key === "alerts") {
      nextState.alerts = Array.isArray(value) ? value : [];
      return;
    }
    if (key === "weatherAdvisories") {
      nextState.weatherAdvisories = Array.isArray(value?.advisories) ? value.advisories : [];
      return;
    }
    if (key === "weatherCities") {
      nextState.weatherCities = Array.isArray(value?.cities) ? value.cities : [];
      return;
    }
    if (key === "kpis") {
      nextState.kpis = value || null;
      return;
    }
    if (key === "carriers") {
      nextState.carriers = Array.isArray(value) ? value : [];
      return;
    }
    if (key === "trends") {
      nextState.trends = normalizeMonthlyTrends(Array.isArray(value) ? value : []);
      return;
    }
    if (key === "regions") {
      nextState.regions = Array.isArray(value) ? value : [];
      return;
    }
    if (key === "aiInsights") {
      nextState.aiInsights = value || EMPTY_PLATFORM_DATA.aiInsights;
      return;
    }
    if (key === "cities") {
      nextState.cities = Array.isArray(value) ? value : [];
    }
  });

  return { errors, nextState };
}

function deriveStats(shipments) {
  const stats = {
    total: shipments.length,
    by_mode: {},
    by_risk: {},
    by_status: {},
  };

  shipments.forEach((shipment) => {
    const status = shipment.status || "Unknown";
    const risk = shipment.risk_level || "Unknown";
    const mode = shipment.mode || "Unknown";

    stats.by_status[status] = (stats.by_status[status] || 0) + 1;
    stats.by_risk[risk] = (stats.by_risk[risk] || 0) + 1;
    stats.by_mode[mode] = (stats.by_mode[mode] || 0) + 1;
  });

  return stats;
}

function parsePlatformDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isShipmentOnTime(shipment) {
  const expected = parsePlatformDate(shipment.estimated_arrival);
  const actual = parsePlatformDate(shipment.actual_arrival);
  const delayMinutes = Number(shipment.delay_minutes ?? 0);
  if (!expected) {
    return null;
  }
  if (actual) {
    return actual.getTime() <= expected.getTime() + (30 * 60 * 1000);
  }
  if (["At Risk", "Delayed", "Critical"].includes(shipment.status)) {
    return false;
  }
  return delayMinutes < 30;
}

function deriveKpis(shipments, alerts, currentKpis) {
  const total = shipments.length;
  const onTime = shipments.filter((shipment) => isShipmentOnTime(shipment) === true).length;
  const delayed = shipments.filter((shipment) => isShipmentOnTime(shipment) === false || ["Delayed", "Critical"].includes(shipment.status)).length;
  const critical = shipments.filter((shipment) => shipment.status === "Critical").length;
  const delayValues = shipments.map((shipment) => Number(shipment.delay_minutes || 0)).filter((value) => Number.isFinite(value));
  const avgDelay = delayValues.length
    ? Number((delayValues.reduce((sum, value) => sum + value, 0) / delayValues.length).toFixed(1))
    : 0;
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged).length;

  return {
    ...(currentKpis || {}),
    total_shipments: total,
    on_time_pct: total ? Number(((onTime / total) * 100).toFixed(1)) : 0,
    delayed_shipments: delayed,
    critical_shipments: critical,
    avg_delay_minutes: avgDelay,
    active_alerts: activeAlerts,
  };
}

function deriveCarrierPerformance(shipments) {
  const carrierMap = new Map();

  shipments.forEach((shipment) => {
    const key = shipment.carrier || "Unknown";
    const current = carrierMap.get(key) || {
      carrier: key,
      total_shipments: 0,
      on_time_shipments: 0,
      delayed_shipments: 0,
      total_delay: 0,
      total_risk: 0,
    };

    current.total_shipments += 1;
    current.total_delay += Number(shipment.delay_minutes || 0);
    current.total_risk += Number(shipment.risk_score || 0);
    if (isShipmentOnTime(shipment) === true) {
      current.on_time_shipments += 1;
    } else if (isShipmentOnTime(shipment) === false) {
      current.delayed_shipments += 1;
    }

    carrierMap.set(key, current);
  });

  return [...carrierMap.values()]
    .map((carrier) => ({
      carrier: carrier.carrier,
      total_shipments: carrier.total_shipments,
      on_time_shipments: carrier.on_time_shipments,
      delayed_shipments: carrier.delayed_shipments,
      on_time_pct: Number(((carrier.on_time_shipments / carrier.total_shipments) * 100).toFixed(1)),
      avg_delay: Number((carrier.total_delay / carrier.total_shipments).toFixed(1)),
      risk_score: Number((carrier.total_risk / carrier.total_shipments).toFixed(2)),
    }))
    .sort((left, right) => right.on_time_pct - left.on_time_pct);
}

function mergeShipmentUpdates(shipments, updates) {
  const updateMap = new Map(updates.map((update) => [update.id, update]));
  return shipments.map((shipment) => {
    const update = updateMap.get(shipment.id);
    if (!update) {
      return shipment;
    }

    return {
      ...shipment,
      current_coords: {
        ...shipment.current_coords,
        lat: Number(update.lat ?? shipment.current_coords?.lat ?? 0),
        lng: Number(update.lng ?? shipment.current_coords?.lng ?? 0),
      },
      progress_pct: Number(update.progress_pct ?? shipment.progress_pct ?? 0),
      risk_level: update.risk_level || shipment.risk_level,
      risk_score: Number(update.risk_score ?? shipment.risk_score ?? 0),
      status: update.status || shipment.status,
      ml_prediction: update.ml_prediction || shipment.ml_prediction || null,
    };
  });
}

function buildChatHistory(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function buildAssistantInsights(response) {
  const insights = [];
  const tools = Array.isArray(response?.tool_trace) ? response.tool_trace : [];
  const sources = Array.isArray(response?.sources) ? response.sources : [];

  tools.slice(0, 3).forEach((tool) => {
    insights.push({
      type: "ok",
      label: tool.tool,
      value: tool.summary || `${tool.count || 0} records used`,
    });
  });

  if (sources[0]?.source) {
    insights.push({
      type: "risk",
      label: "Knowledge",
      value: sources[0].source,
    });
  }

  return insights;
}

function accessLabel(page) {
  return page.label;
}

function syncBrowserLocation(pageId, shipment) {
  const url = new URL(window.location.href);

  if (pageId === "tracking") {
    url.pathname = "/map";
    url.search = "";
    if (shipment?.tracking_number) {
      url.searchParams.set("trackingId", shipment.tracking_number);
    }
  } else {
    url.pathname = "/";
    url.search = "";
    if (pageId && pageId !== "dashboard") {
      url.searchParams.set("page", pageId);
    }
  }

  window.history.pushState({}, "", `${url.pathname}${url.search}`);
}

export default function App() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  const [platformData, setPlatformData] = useState(EMPTY_PLATFORM_DATA);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshingWeather, setRefreshingWeather] = useState(false);
  const [creatingConsignment, setCreatingConsignment] = useState(false);
  const [consignmentSuccess, setConsignmentSuccess] = useState("");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);

  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedShipmentId, setSelectedShipmentId] = useState("");

  const [liveStatus, setLiveStatus] = useState("connecting");
  const [nexusPanelOpen, setNexusPanelOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatTyping, setChatTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "I’m Nexus, your supply chain AI assistant. I can review live shipments, summarize alerts, and suggest route options using the platform’s ML risk scores.",
      createdAt: Date.now(),
    },
  ]);
  const [toasts, setToasts] = useState([]);

  const reconnectTimerRef = useRef(0);
  const heartbeatRef = useRef(0);

  const accessiblePages = useMemo(() => {
    const pagePermissions = user?.permissions?.pages || [];
    return PAGE_REGISTRY.filter((page) => page.id === "tracking" || pagePermissions.includes(page.pageKey));
  }, [user]);
  const selectedShipment = useMemo(
    () => platformData.shipments.find((shipment) => shipment.id === selectedShipmentId) || null,
    [platformData.shipments, selectedShipmentId],
  );

  const nexusStats = useMemo(() => {
    const shipmentCount = platformData.shipments.length;
    const activeAlerts =
      platformData.kpis?.active_alerts ??
      platformData.alerts.filter((alert) => !alert.acknowledged).length;
    const avgRisk = shipmentCount
      ? Math.round(
          platformData.shipments.reduce((sum, s) => sum + Number(s.risk_score || 0), 0) /
            shipmentCount,
        )
      : 0;
    return {
      shipments: String(shipmentCount),
      alerts: String(activeAlerts),
      riskIdx: String(avgRisk),
    };
  }, [platformData.shipments, platformData.alerts, platformData.kpis]);

  function pushToast(title, message, variant = "info") {
    const toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      variant,
    };
    setToasts((current) => [...current, toast]);
  }

  function clearSession() {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUser(null);
    setPlatformData(EMPTY_PLATFORM_DATA);
    setCurrentPage("dashboard");
    setSelectedShipmentId("");
    setLoadError("");
    setLiveStatus("offline");
  }

  async function syncSnapshot(activeToken, initialLoad = false) {
    if (!activeToken) {
      return;
    }

    if (initialLoad) {
      setLoading(true);
    } else {
      setBackgroundRefreshing(true);
    }

    try {
      const snapshot = await loadPlatformSnapshot(activeToken);
      const { errors, nextState } = parseSnapshot(snapshot);

      setPlatformData((current) => ({
        ...current,
        ...nextState,
      }));
      setLoadError("");

      if (errors.length && initialLoad) {
        pushToast("Partial data refresh", errors.slice(0, 2).join(" | "), "warning");
      }
    } catch (error) {
      const message = error.message || "Unable to refresh the platform snapshot.";
      setLoadError(message);
      pushToast("Sync failed", message, "warning");
    } finally {
      if (initialLoad) {
        setLoading(false);
      } else {
        setBackgroundRefreshing(false);
      }
    }
  }

  async function handleLogin(credentials) {
    setAuthSubmitting(true);
    setAuthError("");

    try {
      const response = await login(credentials);
      window.localStorage.setItem(STORAGE_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
      setCurrentPage((current) => (
        current === "tracking"
          ? current
          : response.user?.permissions?.pages?.[0] || "dashboard"
      ));
      pushToast("Signed in", `Welcome back, ${response.user?.name || response.user?.user_id}.`, "success");
    } catch (error) {
      setAuthError(error.message || "Unable to sign in.");
    } finally {
      setAuthSubmitting(false);
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutSubmitting(true);

    try {
      if (token) {
        await logout(token);
      }
    } catch (error) {
      pushToast("Logout warning", error.message || "Session ended locally.", "warning");
    } finally {
      setLogoutConfirmOpen(false);
      setLogoutSubmitting(false);
      clearSession();
    }
  }

  async function handleRefreshWeather() {
    if (!token) {
      return;
    }

    setRefreshingWeather(true);
    try {
      await refreshWeather(token);
      const [weatherCitiesResponse, advisoriesResponse] = await getWeatherBundle(token);
      setPlatformData((current) => ({
        ...current,
        weatherCities: Array.isArray(weatherCitiesResponse?.cities) ? weatherCitiesResponse.cities : current.weatherCities,
        weatherAdvisories: Array.isArray(advisoriesResponse?.advisories) ? advisoriesResponse.advisories : current.weatherAdvisories,
      }));
      pushToast("Weather refreshed", "Live weather telemetry has been updated.", "success");
    } catch (error) {
      pushToast("Weather refresh failed", error.message || "Unable to refresh weather data.", "warning");
    } finally {
      setRefreshingWeather(false);
    }
  }

  async function handleAcknowledgeAlert(alertId) {
    if (!token) {
      return;
    }

    try {
      await acknowledgeAlert(token, alertId);
      setPlatformData((current) => ({
        ...current,
        alerts: current.alerts.map((alert) => (
          alert.id === alertId
            ? { ...alert, acknowledged: true }
            : alert
        )),
      }));
      pushToast("Alert acknowledged", `Alert ${alertId} was acknowledged.`, "success");
    } catch (error) {
      pushToast("Acknowledgement failed", error.message || "Unable to acknowledge alert.", "warning");
    }
  }

  async function handleAcknowledgeAll() {
    if (!token) {
      return;
    }

    try {
      const response = await acknowledgeAllAlerts(token);
      setPlatformData((current) => ({
        ...current,
        alerts: current.alerts.map((alert) => ({ ...alert, acknowledged: true })),
      }));
      pushToast("Alerts acknowledged", `${response?.acknowledged || 0} alerts acknowledged.`, "success");
    } catch (error) {
      pushToast("Bulk acknowledge failed", error.message || "Unable to acknowledge alerts.", "warning");
    }
  }

  async function handleCreateConsignment(payload) {
    if (!token) {
      throw new Error("Authentication required");
    }

    setCreatingConsignment(true);
    setConsignmentSuccess("");

    try {
      const shipment = await createConsignment(token, payload);
      setPlatformData((current) => {
        const shipments = [shipment, ...current.shipments];
        return {
          ...current,
          shipments,
          stats: deriveStats(shipments),
          kpis: deriveKpis(shipments, current.alerts, current.kpis),
          carriers: deriveCarrierPerformance(shipments),
        };
      });
      setConsignmentSuccess(`Shipment ${shipment.tracking_number} created successfully.`);
      pushToast("Shipment created", `${shipment.tracking_number} is now live in the network.`, "success");
      setCurrentPage("shipments");
    } finally {
      setCreatingConsignment(false);
    }
  }

  async function handleDeleteShipment(shipment) {
    if (!token) {
      throw new Error("Authentication required");
    }

    try {
      const response = await deleteShipment(token, shipment.id);

      setPlatformData((current) => {
        const shipments = current.shipments.filter((item) => item.id !== shipment.id);
        const alerts = current.alerts.filter((alert) => (
          alert.shipment_id !== shipment.id && alert.tracking_number !== shipment.tracking_number
        ));
        const weatherAdvisories = current.weatherAdvisories.filter((advisory) => (
          advisory.shipment_id !== shipment.id && advisory.tracking_number !== shipment.tracking_number
        ));

        return {
          ...current,
          shipments,
          alerts,
          weatherAdvisories,
          stats: deriveStats(shipments),
          kpis: deriveKpis(shipments, alerts, current.kpis),
          carriers: deriveCarrierPerformance(shipments),
        };
      });

      if (selectedShipmentId === shipment.id || selectedShipmentId === shipment.tracking_number) {
        setSelectedShipmentId("");
        if (currentPage === "tracking") {
          setCurrentPage("shipments");
          syncBrowserLocation("shipments");
        }
      }

      pushToast(
        "Shipment deleted",
        `${response?.tracking_number || shipment.tracking_number} was removed from the active shipment list.`,
        "success",
      );
    } catch (error) {
      pushToast("Delete failed", error.message || "Unable to delete the shipment.", "warning");
      throw error;
    }
  }

  async function handleOptimizeRoute(payload) {
    if (!token) {
      throw new Error("Authentication required");
    }

    const routes = await optimizeRoute(token, payload);
    if (selectedShipmentId && selectedShipment?.origin === payload.origin && selectedShipment?.destination === payload.destination) {
      setPlatformData((current) => ({
        ...current,
        shipments: current.shipments.map((shipment) => (
          shipment.id === selectedShipmentId
            ? { ...shipment, route_options: routes }
            : shipment
        )),
      }));
    }
    return routes;
  }

  async function handleSendMessage(queryOverride = "") {
    const prompt = String(queryOverride || "").trim();
    if (!prompt || chatLoading || !token) {
      return;
    }

    const nextMessages = [...messages, { role: "user", content: prompt, createdAt: Date.now() }];
    setMessages(nextMessages);
    setChatLoading(true);
    setChatTyping(true);

    try {
      const response = await sendChatMessage(token, {
        message: prompt,
        history: buildChatHistory(nextMessages),
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response?.reply || "No assistant response received.",
          insights: buildAssistantInsights(response),
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error.message || "Unable to reach the Nexus AI Assistant.",
          createdAt: Date.now(),
        },
      ]);
      pushToast(
        "Nexus AI Assistant unavailable",
        error.message || "Unable to reach the AI assistant.",
        "warning",
      );
    } finally {
      setChatLoading(false);
      setChatTyping(false);
    }
  }

  function handleOpenTracking(shipment) {
    setSelectedShipmentId(shipment.id);
    setCurrentPage("tracking");
    syncBrowserLocation("tracking", shipment);
  }

  function handleNavigate(pageId) {
    const page = PAGE_REGISTRY.find((item) => item.id === pageId);
    if (!page) {
      return;
    }

    const allowedPages = user?.permissions?.pages || [];
    if (page.id !== "tracking" && !allowedPages.includes(page.pageKey)) {
      pushToast("Access restricted", `Your role does not have access to ${accessLabel(page)}.`, "warning");
      return;
    }

    setCurrentPage(page.id);
    if (page.id !== "tracking") {
      syncBrowserLocation(page.id);
    }
  }

  useEffect(() => {
    let active = true;
    const storedToken = window.localStorage.getItem(STORAGE_KEY) || "";
    const location = new URL(window.location.href);
    const pageParam = location.searchParams.get("page");
    const trackingId = location.searchParams.get("trackingId");

    if (location.pathname === "/map") {
      setCurrentPage("tracking");
    } else if (pageParam) {
      setCurrentPage(pageParam);
    }

    if (trackingId) {
      setSelectedShipmentId(trackingId);
    }

    async function bootstrap() {
      if (!storedToken) {
        if (active) {
          setAuthLoading(false);
        }
        return;
      }

      try {
        const response = await getProfile(storedToken);
        if (!active) {
          return;
        }
        setToken(storedToken);
        setUser(response?.user || null);
      } catch (error) {
        if (active) {
          clearSession();
          pushToast("Session expired", "Please sign in again to continue.", "warning");
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const allowedPages = user.permissions?.pages || [];
    if (currentPage === "tracking") {
      return;
    }

    if (!allowedPages.includes(currentPage)) {
      setCurrentPage(allowedPages[0] || "dashboard");
    }
  }, [currentPage, user]);

  useEffect(() => {
    if (!selectedShipmentId || !platformData.shipments.length) {
      return;
    }

    const matchedShipment = platformData.shipments.find((shipment) => (
      shipment.id === selectedShipmentId || shipment.tracking_number === selectedShipmentId
    ));

    if (matchedShipment && matchedShipment.id !== selectedShipmentId) {
      setSelectedShipmentId(matchedShipment.id);
    }
  }, [platformData.shipments, selectedShipmentId]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadInitial() {
      await syncSnapshot(token, true);
    }

    loadInitial();
    const intervalId = window.setInterval(() => {
      if (!cancelled) {
        syncSnapshot(token, false);
      }
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let cancelled = false;
    let socket = null;

    const cleanupSocket = () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = 0;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      setLiveStatus((current) => (current === "offline" ? "reconnecting" : "connecting"));

      try {
        socket = new WebSocket(buildWebSocketUrl(API_BASE, token));
      } catch (error) {
        setLiveStatus("offline");
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
        return;
      }

      socket.onopen = () => {
        if (cancelled) {
          return;
        }

        setLiveStatus("live");
        heartbeatRef.current = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "position_update" && Array.isArray(payload?.data)) {
            setPlatformData((current) => {
              const shipments = mergeShipmentUpdates(current.shipments, payload.data);
              return {
                ...current,
                shipments,
                stats: deriveStats(shipments),
              };
            });
            return;
          }

          if (payload?.type === "alert_update" && Array.isArray(payload?.data)) {
            setPlatformData((current) => ({
              ...current,
              alerts: [
                ...payload.data,
                ...current.alerts.filter((alert) => !payload.data.some((incoming) => incoming.id === alert.id)),
              ],
            }));
            return;
          }

          if (payload?.type === "dashboard_update" && payload?.data) {
            setPlatformData((current) => ({
              ...current,
              kpis: payload.data,
            }));
          }
        } catch (error) {
          setLiveStatus("degraded");
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setLiveStatus("degraded");
        }
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }

        if (heartbeatRef.current) {
          window.clearInterval(heartbeatRef.current);
          heartbeatRef.current = 0;
        }

        setLiveStatus("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = 0;
      }
      cleanupSocket();
    };
  }, [token]);

  useEffect(() => {
    if (!toasts.length) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4200);

    return () => window.clearTimeout(timerId);
  }, [toasts]);

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="panel">
          <strong>Loading SupplyLens AI...</strong>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <>
        <LoginPage
          error={authError}
          loading={authSubmitting}
          onLogin={handleLogin}
        />
        <ToastViewport toasts={toasts} />
      </>
    );
  }

  const canAcknowledge = user.permissions?.actions?.includes("acknowledge_alerts");
  const canDeleteShipment = user.permissions?.actions?.includes("delete_shipment");
  const canRefreshWeather = user.permissions?.actions?.includes("refresh_weather");
  const navigationItems = accessiblePages.filter((page) => !page.hiddenInNav);

  let pageContent = null;
  if (currentPage === "dashboard") {
    pageContent = (
      <DashboardPage
        alerts={platformData.alerts}
        aiInsights={platformData.aiInsights}
        kpis={platformData.kpis}
        loading={loading}
        onNavigate={handleNavigate}
        shipments={platformData.shipments}
        stats={platformData.stats}
        trends={platformData.trends}
        weatherAdvisories={platformData.weatherAdvisories}
        weatherCities={platformData.weatherCities}
      />
    );
  } else if (currentPage === "live_map") {
    pageContent = (
      <LiveMapPage
        loading={loading}
        shipments={platformData.shipments}
      />
    );
  } else if (currentPage === "shipments") {
    pageContent = (
      <ShipmentsPage
        canDeleteShipment={canDeleteShipment}
        loading={loading}
        onDeleteShipment={handleDeleteShipment}
        onLoadAnalysis={(shipmentId) => getShipmentAnalysis(token, shipmentId)}
        onOpenTracking={handleOpenTracking}
        shipments={platformData.shipments}
      />
    );
  } else if (currentPage === "tracking") {
    pageContent = (
      <TrackingPage
        loading={loading}
        onBack={() => {
          setCurrentPage("shipments");
          syncBrowserLocation("shipments");
        }}
        onOptimizeRoute={handleOptimizeRoute}
        onSimulateScenario={(payload) => simulateShipmentScenario(token, payload)}
        selectedShipment={selectedShipment}
      />
    );
  } else if (currentPage === "alerts") {
    pageContent = (
      <AlertsPage
        alerts={platformData.alerts}
        canAcknowledge={canAcknowledge}
        canRefreshWeather={canRefreshWeather}
        loading={loading}
        onAcknowledgeAlert={handleAcknowledgeAlert}
        onAcknowledgeAll={handleAcknowledgeAll}
        onOptimizeRoute={handleOptimizeRoute}
        onRefreshWeather={handleRefreshWeather}
        refreshingWeather={refreshingWeather}
        shipments={platformData.shipments}
        weatherAdvisories={platformData.weatherAdvisories}
        weatherCities={platformData.weatherCities}
      />
    );
  } else if (currentPage === "analytics") {
    pageContent = (
      <AnalyticsPage
        carriers={platformData.carriers}
        kpis={platformData.kpis}
        loading={loading}
        shipments={platformData.shipments}
        stats={platformData.stats}
        trends={platformData.trends}
      />
    );
  } else if (currentPage === "new_consignment") {
    pageContent = (
      <NewConsignmentPage
        cities={platformData.cities}
        onCreate={handleCreateConsignment}
        onPredictRisk={(payload) => predictRisk(token, payload)}
        submitting={creatingConsignment}
        successMessage={consignmentSuccess}
        weatherCities={platformData.weatherCities}
      />
    );
  }

  return (
    <>
      <div className="app-shell app-shell--workspace">
        <aside className="workspace-nav">
          <div className="workspace-brand">
            <p className="eyebrow">SupplyLens AI</p>
            <h2>Control Tower</h2>
          </div>

          <div className="workspace-nav__links">
            {navigationItems.map((page) => (
              <button
                type="button"
                key={page.id}
                className={`nav-link ${currentPage === page.id ? "nav-link--active" : ""}`}
                onClick={() => handleNavigate(page.id)}
              >
                <span>{page.label}</span>
                {page.id === "alerts" && platformData.alerts.length ? (
                  <span className="nav-link__badge">{platformData.alerts.length}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="workspace-user">
            <div>
              <strong>{user.name}</strong>
              <p>{user.role_label}</p>
            </div>
            <span className={`live-badge live-badge--${liveStatus}`}>{liveStatus}</span>
            {backgroundRefreshing ? <small>Syncing shipment telemetry...</small> : <small>Live network visibility is active.</small>}
            <button type="button" onClick={() => setLogoutConfirmOpen(true)}>Sign Out</button>
          </div>
        </aside>

        <main className="workspace-main">
          {loadError ? <div className="banner banner--danger">{loadError}</div> : null}
          {pageContent}
        </main>
      </div>

      <NexusAssistantPanel
        open={nexusPanelOpen}
        onClose={() => setNexusPanelOpen(false)}
        messages={messages}
        onSendMessage={handleSendMessage}
        thinking={chatTyping}
        stats={nexusStats}
      />
      <FloatingButton onClick={() => setNexusPanelOpen((open) => !open)} active={nexusPanelOpen} />

      <ToastViewport toasts={toasts} />

      {logoutConfirmOpen ? (
        <Modal title="Sign Out?" onClose={() => !logoutSubmitting && setLogoutConfirmOpen(false)}>
          <div className="detail-stack">
            <p className="confirm-copy">
              You are about to sign out of SupplyLens AI. You will need to sign in again to get back to your live workspace.
            </p>
            <div className="action-row action-row--end">
              <button type="button" className="ghost-button" onClick={() => setLogoutConfirmOpen(false)} disabled={logoutSubmitting}>
                Cancel
              </button>
              <button type="button" className="button--danger" onClick={handleLogout} disabled={logoutSubmitting}>
                {logoutSubmitting ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
