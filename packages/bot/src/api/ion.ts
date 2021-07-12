import { formatDistance } from "date-fns";

import Ion from "../ion/core";
import VERSION from "../version";

export const getUserBot = async (token: string) => {
  const status = Ion.status;

  return {
    isAuth: Ion.isValidToken(token),
    profile: Ion.user,
    status,
    upTime: formatDistance(Ion.startTime, new Date(), {
      addSuffix: true,
    }),
    version: VERSION,
  };
};

export const getLoadedModules = async () => {
  return Ion.loadedModules;
};
