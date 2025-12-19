import React from "react";

export const CardFaceCustomTextOverlay: React.FC<{
  customTextNode?: React.ReactNode;
  customTextPosition?: "sidebar" | "bottom-left" | "center";
}> = ({ customTextNode, customTextPosition }) => {
  if (!customTextNode) return null;

  if (customTextPosition === "bottom-left") {
    return <div className="absolute bottom-1 left-1 z-10 max-w-[80%]">{customTextNode}</div>;
  }

  if (customTextPosition === "center") {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-1">
        <div className="w-full text-center pointer-events-auto">{customTextNode}</div>
      </div>
    );
  }

  return null;
};

