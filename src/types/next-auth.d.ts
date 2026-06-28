import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      phone: string;
      name?: string | null;
      image?: string | null;
      role?: string;
      error?: string;
    };
  }

  interface User {
    id: string;
    phone: string;
    name?: string | null;
    image?: string | null;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    phone?: string;
    role?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    error?: string;
  }
}
