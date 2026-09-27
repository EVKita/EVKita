/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Bahasa situs publik ("id" atau "en"), dibaca middleware dari cookie. */
    pubLang: string;
  }
}
