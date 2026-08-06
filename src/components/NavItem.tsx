import { NavLink } from "react-router-dom";

interface NavItemProps {
  path: string;
  label: string;
  icon: string;
  status?: string;
}

export function NavItem({ path, label, icon, status }: NavItemProps) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `mvo-nav-item ${isActive ? "active" : ""}`
      }
      end={path === "/"}
    >
      <span className="mvo-nav-icon">{icon}</span>
      <span>{label}</span>
      {status && <small>{status}</small>}
    </NavLink>
  );
}