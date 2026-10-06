"use client";
import { useEffect, useState } from "react";
export function AccountNav() {
  const [name, setName] = useState("Account");
  useEffect(() => {
    let active = true;
    fetch("/api/membership", { cache: "no-store", redirect: "error" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { me?: { name?: string } };
        if (active && data.me?.name) setName(data.me.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <a className="account-nav" href="/account">
      <span className="account-avatar" aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </span>
      <span>{name}</span>
    </a>
  );
}
