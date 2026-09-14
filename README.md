# Grafik Służby Liturgicznej

Responsywna aplikacja w języku polskim: React, TypeScript, Vite, Tailwind CSS 4, Lucide i Supabase. Wybór ministranta zamiast logowania, otwarte zapisy, stałe dyżury, wyjątki nieobecności oraz synchronizacja pomiędzy przeglądarkami.

## Uruchomienie

Wymagany Node.js 22.12+ lub 24 LTS i npm.

```sh
npm ci
npm run dev
```

Bez obu zmiennych Supabase uruchamia się **jawny podgląd demonstracyjny**. Dane podglądu są przechowywane w localStorage tej przeglądarki; nie są wysyłane do parafii. To pozwala sprawdzić wszystkie akcje bez zewnętrznej bazy. Usunięcie klucza `liturgy.demo.v1` przywraca przykłady dla bieżącego tygodnia.

## Podłączenie Supabase

1. Utwórz projekt Supabase z PostgreSQL 15 lub nowszym.
2. W SQL Editor wykonaj cały `supabase/schema.sql`. Następnie, na nowej bazie, uruchom `supabase/seed.sql`, jeżeli chcesz sześciu przykładowych ministrantów i Msze na bieżący tydzień.
3. Skopiuj `.env.example` do `.env`. Ustaw URL projektu i publiczny klucz `anon` lub publishable. Nie używaj `service_role` ani secret key w aplikacji przeglądarkowej.
4. Uruchom ponownie serwer Vite. Zniknie pasek demonstracyjny, a aplikacja odczyta dane Supabase. Błąd połączenia nigdy nie przełącza działającej integracji na dane lokalne.
5. Skrypt dodaje cztery tabele do istniejącej publikacji `supabase_realtime`. W standardowym projekcie Supabase ta publikacja już istnieje. Jeśli ją usunięto, przywróć ją zgodnie z konfiguracją projektu i ponownie wykonaj schemat.

```dotenv
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=publiczny-klucz-projektu
```

Brak tylko jednej zmiennej jest błędem konfiguracji. Zmienne `VITE_*` trafiają do publicznego pakietu podczas budowania.

## Model obecności

- `altar_servers`: sześć dozwolonych stopni, pełne imię i nazwisko.
- `masses`: konkretne nabożeństwo. Dodatkowe `is_extra` rozróżnia terminy nieregularne; tylko one mają kosz w interfejsie. Formularz zawsze tworzy `is_extra = true`.
- `recurring_rules`: jeden wiersz na ministranta, dzień tygodnia i godzinę. Bez generowania zapisów na kolejne tygodnie.
- `mass_attendees`: jeden wiersz na parę ministrant/Msza, typu `single` albo `excused`. Upsert atomowo zmienia typ wyjątku.
- `effective_attendees`: widok z `security_invoker`, obliczający reguły oraz pojedyncze zapisy i odejmujący nieobecności. Osoba nigdy nie jest liczona dwa razy; przy nakładaniu się reguły i zapisu pojedynczego etykieta to „Stały”.

Reguły dopasowują **dzień tygodnia i godzinę w Europe/Warsaw**, niezależnie od nazwy nabożeństwa. Obejmują też nowe Msze dodane później o tej porze, bez dopisywania wierszy obecności. Jeżeli w tym samym czasie istnieją dwie Msze, reguła obejmuje obie; wyjątek dotyczy tylko wybranego `mass_id`.

„Zgłoś nieobecność” tworzy `excused`. „Przywróć obecność” usuwa wyjątek, jeśli istnieje reguła, lub zamienia go na `single`, jeśli reguła została już usunięta. „Wypisz się” usuwa tylko zapis jednorazowy. Ponowne ustawienie reguły nie kasuje zgłoszonych nieobecności — przywraca się je osobno. Usunięcie stałego dyżuru wymaga potwierdzenia; pozostawia niezależne wpisy `single` i `excused`.

Zgodnie z podanym schematem reguły nie mają okresu obowiązywania: ich zmiana wpływa również na obliczony widok przeszłych tygodni. Aplikacja prezentuje **deklaracje**, a nie archiwum faktycznej obecności. Sugerowana liczba miejsc nie jest limitem, również w bazie. Przyciski zapisu są blokowane tylko podczas wykonywania operacji; nigdy ze względu na liczbę obecnych.

SQL seed tworzy tylko bieżący tydzień. Reguły nie tworzą samych Mszy. Terminy następnych tygodni wprowadza parafia (przez formularz lub import do `masses`); reguły zadziałają od razu. Skrypty można uruchomić ponownie: seed nie dubluje swoich danych. Schemat jest przeznaczony dla nowej bazy, a nie jako migracja nieznanej wcześniejszej struktury.

## Daty i synchronizacja

Nawigacja zaczyna tydzień od poniedziałku. Zapytania używają przedziału `[poniedziałek 00:00, kolejny poniedziałek 00:00)` w czasie polskim, z prawidłowymi przesunięciami letnimi/zimowymi. Formularz odrzuca nieistniejącą godzinę podczas wiosennej zmiany czasu. Przy powtórzonej jesiennej godzinie wybór offsetu jest zgodny z `date-fns-tz`; reguły obejmują obie instancje tej godziny, jeśli zostaną utworzone w bazie.

Zmiany wszystkich czterech tabel przez Supabase Realtime uruchamiają odświeżenie widoku. Jest także odświeżanie co minutę, po odzyskaniu sieci i powrocie do karty. UI informuje o utracie Realtime. Licznik żądań chroni przed nadpisaniem nowego tygodnia starszą odpowiedzią. Odczyty są stronicowane, aby nie uciąć pełnej listy przy domyślnym limicie PostgREST. Awaria zapisu jest widoczna i nie jest pozorowana jako sukces. Po udanym zapisie i błędzie odświeżenia UI osobno pokazuje potwierdzenie zapisu oraz komunikat o nieaktualnym grafiku.

## Weryfikacja i build

```sh
npm test
npm run build
npm run preview
```

Testy obejmują rzeczywisty silnik PostgreSQL w PGlite (RLS anon, SQL, unikalność, kaskady, wyjątki, seed i zmianę czasu), komponenty React (zapis ponad sugerowaną obsadę, pełna lista osób, nieobecność/przywrócenie, kosz i localStorage) oraz integrację aplikacji (opóźnione odpowiedzi, zmiana tygodnia podczas zapisu, błędy i odświeżanie po zdarzeniu subskrypcji).

Do hostingu statycznego przekaż katalog `dist`. Zmienne Supabase ustaw **przed** `npm run build`. Serwuj przez HTTPS. Aplikacja nie wymaga serwera Node w środowisku produkcyjnym. Zewnętrzny projekt Supabase i wdrożenie nie są tworzone przez samo uruchomienie repozytorium.

## Model zaufania

Otwarte RLS dla `anon` i brak hasła są świadomym wymaganiem: każdy z dostępem do API może czytać, dodawać, edytować i usuwać dane oraz działać pod wybraną tożsamością. Selektor nie jest uwierzytelnieniem, a ukryty kosz zwykłej Mszy nie jest ograniczeniem uprawnień API.

## Pliki

`src/types/database.ts` zawiera typy tabel, relacji i widoku. `src/lib/repository.ts` obsługuje bazę, upserty, stronicowanie i subskrypcje. Wymagane komponenty są w `src/components`, a całość integruje `src/App.tsx`. Style są lokalne i nie pobierają zewnętrznych fontów.

Dokumentacja integracji: [Supabase Upsert](https://supabase.com/docs/reference/javascript/upsert), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite), [Vite](https://vite.dev/guide/).
