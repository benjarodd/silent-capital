import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <div>
              <p className="header-kicker">Silent Capital</p>
              <h1 className="header-title">Encrypted Fundraising Studio</h1>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
