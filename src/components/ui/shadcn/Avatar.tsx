import * as React from "react";
import { cn } from "../../../lib/utils";

const Avatar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary/10",
      className,
    )}
    {...props}
  />
);
Avatar.displayName = "Avatar";

const AvatarImage = ({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
  <img className={cn("aspect-square h-full w-full object-cover", className)} {...props} />
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full text-xs font-medium text-primary",
      className,
    )}
    {...props}
  />
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
