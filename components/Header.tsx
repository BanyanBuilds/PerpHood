"use client";

import Link from "next/link";
import { Activity, Plus, WalletCards } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./icons";
import { KeyButton } from "./KeyButton";
import { useMarkets } from "./MarketProvider";
import { ProfileMenu } from "./ProfileMenu";
import { useTerminalPerformance } from "./TerminalPerformanceProvider";

export function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const { connected, toggleWallet, balanceEth } = useMarkets();
  const { effectiveFps } = useTerminalPerformance();

  const handleWalletButton = () => {
    if (!connected) toggleWallet();
    setProfileOpen(true);
  };

  return (
    <header className="site-header terminal-site-header">
      <div className="header-inner terminal-only-header">
        <Link href="/" className="brand-lockup" aria-label="Open LEVERAGE X terminal">
          <BrandMark />
          <span><strong>LEVERAGE X</strong><small>ROBINHOOD CHAIN</small></span>
        </Link>

        <div className="terminal-header-status" aria-label="Terminal status">
          <span><i />BattlePool live</span>
          <span><Activity size={13} />{effectiveFps} Hz</span>
        </div>

        <div className="header-actions">
          {connected && <Link href="/funding" className="header-fund-button"><Plus size={15}/><span>Fund</span><strong>{balanceEth.toFixed(3)} ETH</strong></Link>}
          <KeyButton compact className={connected ? "profile-key" : ""} onClick={handleWalletButton}>
            {connected ? <><span className="profile-key-avatar">LX</span><span className="profile-key-copy"><strong>Trading account</strong><small>Open account sidebar</small></span></> : <><WalletCards size={17} />Connect Wallet</>}
          </KeyButton>
        </div>
      </div>
      {connected && profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
