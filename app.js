const canvas = document.querySelector("#chainCanvas");
const ctx = canvas.getContext("2d");
const nav = document.querySelector("#siteNav");
const menuToggle = document.querySelector(".menu-toggle");
const walletModal = document.querySelector("[data-wallet-modal]");
const walletStatus = document.querySelector("[data-wallet-status]");
const walletLabel = document.querySelector("[data-wallet-label]");
const connectButton = document.querySelector(".connect-button");
const copyContractButton = document.querySelector("[data-copy-contract]");
const contractAddressElement = document.querySelector("[data-contract-address]");
const discoveredProviders = new Map();
const MBTC_CONTRACT = "0x3898257dd2cd6d2a3b6e3435f73568a725262b9b";
const BASE_CHAIN_ID = "0x2105";
const PRICE_ENDPOINT = `https://api.dexscreener.com/token-pairs/v1/base/${MBTC_CONTRACT}`;

let width = 0;
let height = 0;
let points = [];

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.max(36, Math.floor((width * height) / 26000));
  points = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: Math.random() * 1.8 + 0.8,
  }));
}

function drawNetwork() {
  ctx.clearRect(0, 0, width, height);

  for (const p of points) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -20) p.x = width + 20;
    if (p.x > width + 20) p.x = -20;
    if (p.y < -20) p.y = height + 20;
    if (p.y > height + 20) p.y = -20;
  }

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 145) {
        const alpha = (1 - distance / 145) * 0.22;
        ctx.strokeStyle = `rgba(48, 213, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  for (const p of points) {
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 8);
    gradient.addColorStop(0, "rgba(247, 147, 26, 0.9)");
    gradient.addColorStop(1, "rgba(48, 213, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawNetwork);
}

function collectInjectedProviders() {
  const ethereum = window.ethereum;
  if (!ethereum) return;

  const providers = ethereum.providers || [ethereum];
  providers.forEach((provider) => {
    if (provider.isMetaMask) discoveredProviders.set("metamask", provider);
    if (provider.isTrust || provider.isTrustWallet) discoveredProviders.set("trust", provider);
    if (provider.isCoinbaseWallet || provider.isCoinbaseBrowser) discoveredProviders.set("base", provider);
  });
}

function getWalletProvider(id) {
  collectInjectedProviders();
  const provider = discoveredProviders.get(id);
  if (provider) return provider;

  // Some browsers expose only a single injected provider instead of wallet-specific flags.
  if (id === "metamask" && window.ethereum?.request) return window.ethereum;
  return null;
}

function updateWalletAvailability() {
  collectInjectedProviders();
  ["metamask", "trust", "base"].forEach((id) => {
    const label = document.querySelector(`[data-wallet-state="${id}"]`);
    const button = document.querySelector(`[data-wallet="${id}"]`);
    const available = Boolean(getWalletProvider(id));
    label.textContent = available ? "Available" : "Not detected";
    button.classList.toggle("available", available);
  });
}

function openWalletModal() {
  updateWalletAvailability();
  walletModal.hidden = false;
  walletStatus.textContent = "Choose a wallet provider installed in this browser.";
}

function closeWalletModal() {
  walletModal.hidden = true;
}

function providerName(id) {
  return {
    metamask: "MetaMask",
    trust: "Trust Wallet",
    base: "Base Wallet",
  }[id];
}

async function ensureBaseNetwork(provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_CHAIN_ID,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        },
      ],
    });
  }
}

async function connectWallet(id) {
  updateWalletAvailability();
  const provider = getWalletProvider(id);

  if (!provider) {
    walletStatus.textContent = `${providerName(id)} was not detected. Open the site from http://localhost, then refresh after unlocking the wallet extension.`;
    return;
  }

  try {
    walletStatus.textContent = `Opening ${providerName(id)}...`;
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const account = accounts?.[0];
    if (!account) throw new Error("No account returned by wallet.");

    walletStatus.textContent = "Switching to Base...";
    await ensureBaseNetwork(provider);

    const shortened = `${account.slice(0, 6)}...${account.slice(-4)}`;
    walletLabel.textContent = shortened;
    connectButton.classList.add("connected");
    walletStatus.textContent = `Connected on Base: ${shortened}`;
    setTimeout(closeWalletModal, 700);
  } catch (error) {
    walletStatus.textContent = error?.message || "Wallet connection was rejected.";
  }
}


function formatUsd(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return "Unavailable";
  const maximumFractionDigits = price >= 1 ? 4 : price >= 0.01 ? 6 : 10;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(price);
}

function formatCompactUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

function updateText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

async function loadMbtcPrice() {
  try {
    const response = await fetch(PRICE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error("Price feed unavailable");
    const pairs = await response.json();
    const pair = pairs
      .filter((item) => item?.chainId === "base" && item?.priceUsd)
      .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];

    if (!pair) throw new Error("No Base MBTC market found");

    updateText("[data-price-usd]", formatUsd(pair.priceUsd));
    updateText("[data-liquidity]", formatCompactUsd(pair?.liquidity?.usd));
    const change = Number(pair?.priceChange?.h24);
    updateText("[data-price-change]", Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--");
  } catch (error) {
    updateText("[data-price-usd]", "Unavailable");
    updateText("[data-liquidity]", "--");
    updateText("[data-price-change]", "--");
  }
}

async function copyContractAddress() {
  try {
    await navigator.clipboard.writeText(MBTC_CONTRACT);
    copyContractButton.classList.add("copied");
    copyContractButton.setAttribute("aria-label", "MBTC contract address copied");
    setTimeout(() => {
      copyContractButton.classList.remove("copied");
      copyContractButton.setAttribute("aria-label", "Copy MBTC contract address");
    }, 1400);
  } catch (error) {
    contractAddressElement.textContent = MBTC_CONTRACT;
  }
}

window.addEventListener("eip6963:announceProvider", (event) => {
  const { info, provider } = event.detail || {};
  const name = `${info?.name || ""} ${info?.rdns || ""}`.toLowerCase();
  if (name.includes("metamask") || provider?.isMetaMask) discoveredProviders.set("metamask", provider);
  if (name.includes("trust") || provider?.isTrust || provider?.isTrustWallet) discoveredProviders.set("trust", provider);
  if (name.includes("coinbase") || name.includes("base") || provider?.isCoinbaseWallet) {
    discoveredProviders.set("base", provider);
  }
  updateWalletAvailability();
});

window.addEventListener("eip6963:requestProvider", () => {});
window.dispatchEvent(new Event("eip6963:requestProvider"));

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
drawNetwork();

menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll("[data-open-wallet]").forEach((button) => {
  button.addEventListener("click", openWalletModal);
});

document.querySelectorAll("[data-close-wallet]").forEach((button) => {
  button.addEventListener("click", closeWalletModal);
});

document.querySelectorAll("[data-wallet]").forEach((button) => {
  button.addEventListener("click", () => connectWallet(button.dataset.wallet));
});

copyContractButton.addEventListener("click", copyContractAddress);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !walletModal.hidden) closeWalletModal();
});

updateWalletAvailability();
loadMbtcPrice();
setInterval(loadMbtcPrice, 60000);
