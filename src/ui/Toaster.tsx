import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Toaster as SonnerToaster } from "sonner";
import "./Toaster.css";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      offset={{ top: 48, right: 16 }}
      mobileOffset={{ top: 16, right: 12 }}
      theme="dark"
      richColors={false}
      closeButton
      duration={5000}
      icons={{
        success: <></>,
        error: <></>,
        close: <HugeiconsIcon icon={Cancel01Icon} size={12} color="currentColor" />,
      }}
      containerAriaLabel="Notifications"
    />
  );
}
