# Ministrantappka

Aplikacja dla wspólnoty ministrantów: wspólny grafik służb liturgicznych, zapisy bez zakładania kont oraz całoroczna rywalizacja punktowa z odznakami. Całość po polsku, z czasem polskim (Europe/Warsaw) i działaniem na telefonie jak i na komputerze.

Wystarczy wybrać swoje imię w nagłówku — nie ma logowania ani haseł dla ministrantów.

## Grafik

- **Tygodniowy plan** Mszy Świętych, nabożeństw i innych wydarzeń parafii, z wyborem dnia i nawigacją między tygodniami.
- **Zapisy jednym kliknięciem:** zapis jednorazowy albo stały dyżur (np. każdy poniedziałek o 18:00 — obejmuje też przyszłe terminy dodane później).
- **Nieobecności:** zgłoszenie nieobecności na pojedynczy termin bez usuwania stałego dyżuru, z możliwością przywrócenia.
- **Karty terminów** pokazują obsadę, sugerowaną liczbę osób, celebransa i okazję (np. chrzciny).
- **Oznaczenia dni:** uroczystości, święta i wspomnienia widać w kalendarzu, a niedziele i uroczystości wyróżniają się kolorem.

## Moje służby

Osobisty widok ministranta: najbliższa służba, terminy z kolejnych 30 dni, lista stałych dyżurów do edycji oraz statystyka obecności.

## Rywalizacja

Punkty naliczają się za **potwierdzone obecności** („Byłem” / „Nie byłem” — pytanie pojawia się godzinę po rozpoczęciu służby, także z wyprzedzeniem wstecznym). Przyszłe terminy i nieobecności nie dają punktów.

- **Punkty:** 15 pkt za służbę w dzień powszedni, 10 pkt w niedzielę.
- **Regularność:** co najmniej 2 służby w tygodniu dają bonus (10 pkt, rosnący o 5 pkt za każdy kolejny tydzień serii, maksymalnie do 30 pkt).
- **Poziomy:** od „Pierwszego kroku” po „Mistrza regularności” (progi m.in. 100, 300, 600 pkt).
- **Odznaki:** zdobywane za liczbę służb spełniających warunek ustawiony przez administratora — np. służby w niedziele, o danej godzinie, w konkretne daty, na wydarzeniach o danej nazwie, u danego celebransa, w dni oznaczone (uroczystość, święto, wspomnienie) albo z daną okazją. Każda karta pokazuje cel, nagrodę i pasek postępu; są filtry „Wszystkie / Zdobyte / W drodze”.
- **Ranking wspólnoty** z miejscami (remis = wspólne miejsce), historią punktów i podglądem zdobytych odznak innych osób.
- **Sezon** trwa przez rok liturgiczny — od I Niedzieli Adwentu do kolejnego Adwentu.
- Można się **wypisać z rywalizacji** (profil znika z rankingu, a punkty liczą się dalej w tle) i wrócić w każdej chwili bez utraty dorobku.

## Panel administratora (opiekuna)

Logowanie kodem PIN otwiera pasek narzędzi administratora:

- **Terminy:** dodawanie pojedynczych Mszy i nabożeństw oraz całych serii cyklicznych (co tydzień / co miesiąc, wybrane dni i tygodnie miesiąca), edycja i usuwanie (pojedynczo lub cała seria).
- **Księża na tydzień** — przypisywanie celebransów do terminów.
- **Oznaczanie dni** — uroczystości, święta, wspomnienia własne lub z podpowiedzi.
- **Ministranci** — dodawanie, edycja i usuwanie osób wraz ze stopniami (Kandydat, Ministrant, Lektor, Ceremoniarz, Szafarz) oraz statystyki aktywności.
- **Punktacja** — dodawanie, odejmowanie i ustawianie punktów z powodem widocznym w historii, a także reset całego sezonu (z potwierdzeniem).
- **Odznaki** — pełny edytor: dodawanie, edycja i usuwanie odznak oraz czyszczenie całej listy. Kreator ma dwa kroki: najpierw nazwa, opis, ikona i nagroda, potem warunek (rodzaj wydarzenia, dni tygodnia, godziny, daty, nazwa, celebrans, oznaczenie dnia, okazja, sposób liczenia).

## Dodatki

- **Tryb demonstracyjny:** bez konfiguracji serwera aplikacja działa na przykładowych danych zapisywanych lokalnie w przeglądarce — do wypróbowania wszystkich funkcji.
- **Motywy wyglądu** (jasny/ciemny/systemowy) i kolory akcentów, zapamiętywane na urządzeniu.
- **Instalacja jak aplikacja (PWA)** na telefonie.
- **Synchronizacja na żywo:** zmiany widać na wszystkich urządzeniach, z odświeżaniem po powrocie do karty i trybem offline.

## Dla deweloperów

Wymagany Node.js 22.12+ lub 24 LTS i npm.

```sh
npm ci
npm run dev    # podgląd demonstracyjny bez bazy
npm test       # testy (Vitest)
npm run build  # budowa do katalogu dist
```

Aplikacja korzysta z React, TypeScript, Vite, Tailwind CSS i Supabase. Podłączenie współdzielonej bazy dla parafii: utwórz projekt Supabase (PostgreSQL 15+), wykonaj `supabase/schema.sql`, potem po kolei skrypty z `supabase/migrations/`, opcjonalnie `supabase/seed.sql` na start, i ustaw w `.env` zmienne z `.env.example`. Bez zmiennych Supabase aplikacja działa w trybie demonstracyjnym.
