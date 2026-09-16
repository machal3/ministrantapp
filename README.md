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
2. W SQL Editor wykonaj cały `supabase/schema.sql`, potem `supabase/migrations/202609140001_admin.sql`. Następnie, na nowej bazie, uruchom `supabase/seed.sql`, jeżeli chcesz sześciu przykładowych ministrantów i Msze na bieżący tydzień. Na istniejącej bazie wystarczy nowy skrypt `202609140001_admin.sql` — nie usuwaj danych ani nie uruchamiaj ponownie seeda.
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

## Tryb administratora

Przycisk **Administrator** w nagłówku otwiera formularz PIN-u. Początkowy PIN to **0403**, z zerem na początku. Administrator może zmieniać imiona/nazwiska i stopnie istniejących ministrantów oraz godzinę każdej konkretnej Mszy. Dodawanie i usuwanie dodatkowych nabożeństw także wymaga trybu administratora. Kosz nadal dotyczy tylko Mszy dodatkowych.

Edycja ministranta zachowuje jego `id`, zapisy i reguły. Edycja godziny zachowuje `mass_id`, datę w czasie polskim, zapisy jednorazowe i wyjątki, ale przelicza stałe dyżury według nowej godziny. Zmiana nie przesuwa reguł ani innych Mszy. Formularz wyraźnie informuje o tym przed zapisem.

W Supabase PIN jest weryfikowany przez funkcję `admin_login`; prywatne tabele w `liturgy_private` nie są dostępne dla `anon` ani `authenticated`. W bazie zapisany jest hash PIN-u z losową solą oraz hashe losowych tokenów sesji. RPC do każdej operacji zarządzania sprawdza token i jego datę wygaśnięcia. Bezpośrednie INSERT/UPDATE/DELETE w `altar_servers` i `masses` są odebrane zwykłym klientom. Funkcje mają stały pusty `search_path` i ograniczone uprawnienia wykonania.

Sesja trwa 30 minut. Przeglądarka trzyma token wyłącznie w pamięci, bez localStorage ani sessionStorage: odświeżenie strony wymaga ponownego PIN-u. Przycisk wyjścia unieważnia token w bazie. Błędny PIN pozwala od razu spróbować ponownie, bez limitu prób i blokady czasowej. W podglądzie lokalnym ochrona jest wyłącznie demonstracyjna. Moduł z demonstracyjnym PIN-em nie jest dołączany do buildu z ustawionymi zmiennymi Supabase.

**Aktualizacja działającej strony:** najpierw uruchom `supabase/migrations/202609140001_admin.sql` w SQL Editor istniejącego projektu, następnie opublikuj nowy kod przez GitHub/Cloudflare. Nie dodawaj PIN-u do zmiennych `VITE_*`. Skrypt można uruchomić ponownie: nie zmienia danych ani już skonfigurowanego PIN-u. Stary frontend po migracji nadal pozwala się zapisywać, ale zarządzanie Mszami wymaga publikacji nowej wersji.

Nowy skrypt jest przyrostową aktualizacją wcześniejszego `schema.sql`. Repozytorium nadal nie wykonuje automatycznie migracji w zdalnym Supabase; folder `migrations` nie oznacza, że wdrożono już Supabase CLI/CI lub historię migracji wcześniejszej bazy.

## Model zaufania

Wybór ministranta nadal nie jest uwierzytelnieniem. Każdy klient może odczytywać listy i zarządzać zapisami oraz stałymi dyżurami w modelu parafialnego zaufania. Zarządzanie osobami i nabożeństwami wymaga teraz sesji administratora weryfikowanej w bazie.

Czterocyfrowy, wspólny PIN jest prostym zabezpieczeniem, nie odpowiednikiem indywidualnych kont administratorów. Początkowy PIN podany w tym repozytorium jest znany osobom mającym dostęp do kodu/instrukcji. Właściciel bazy może zmienić go przez SQL Editor, aktualizując `pin_hash = sha256(convert_to(salt || ':' || NOWY_PIN, 'UTF8'))` w `liturgy_private.admin_config` i usuwając stare sesje z `liturgy_private.admin_sessions`. Nie zmieniaj go w kodzie przeglądarki.

## Pliki

### Ekran „Moje służby”

Przełącznik przy nagłówku prowadzi do najbliższej aktywnej służby, kolejnych terminów z najbliższych 30 dni (wraz ze zgłoszonymi nieobecnościami), stałych dyżurów i dotychczasowej statystyki. Wybór osoby jest wspólny z grafikiem. Strzałka przy terminie otwiera właściwy dzień grafiku; główna karta ma przycisk z opisem. Na telefonie przełącznik widoków pozostaje dostępny podczas przewijania.

`loadUpcomingServices(from, to)` i `loadWeek()` korzystają ze wspólnego odczytu zakresu w repository. Zakres przyszły zaczyna się teraz i kończy na początku dnia za 30 dni w strefie Europe/Warsaw (koniec wyłączny). Repozytorium pobiera wydarzenia i wyjątki z tego zakresu, reguły oraz efektywną obsadę z istniejącego widoku `effective_attendees`, zachowując stronicowanie i paczki identyfikatorów. Są to zapytania dla jednego zakresu, bez osobnego pobierania każdego tygodnia. Pełna obsada jest potrzebna do liczników miejsc. Statystyka pochodzi z istniejącego `recentAttendance` i zachowuje dotychczasową definicję. Nie są wymagane nowe migracje SQL.

Oba ekrany mają jedną subskrypcję Realtime z dotychczasowym odświeżaniem po powrocie do karty i co minutę. Nowy zakres jest pobierany tylko podczas korzystania z „Moich służb”. Błędy odczytu mają przycisk ponowienia; zachowany wynik jest oznaczony jako nieaktualny, a jego akcje są zablokowane do udanego odświeżenia. Starsze odpowiedzi po zmianie osoby są ignorowane.

`MyServicesView`, `ServiceCard` i wspólny `MyRecurringRules` składają ekran; `useUpcomingServices` zarządza jego odczytem, a `personalServices` filtruje i sortuje terminy. Akcje wywołują ten sam handler aplikacji co `MassCard`: nieobecność zapisuje wyjątek dla jednej Mszy, przywrócenie usuwa wyjątek przy aktywnym dyżurze, a wypisanie usuwa jednorazowy zapis. Stałe dyżury zachowują istniejący edytor i `describeRule()`.

Testy funkcji i integracji ekranu: `tests/my-services.test.tsx`. Uruchom `npm test` i `npm run build` (obejmuje TypeScript). Widok sprawdzono również w przeglądarce przy 375, 390, 430, 768 i 1440 px.

`src/types/database.ts` zawiera typy tabel, relacji i widoku. `src/lib/repository.ts` obsługuje bazę, upserty, stronicowanie i subskrypcje. Wymagane komponenty są w `src/components`, a całość integruje `src/App.tsx`. Style są lokalne i nie pobierają zewnętrznych fontów.

Dokumentacja integracji: [Supabase Upsert](https://supabase.com/docs/reference/javascript/upsert), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite), [Vite](https://vite.dev/guide/).

### Usunięcie blokady logowania administratora

W SQL Editor istniejącego projektu uruchom `supabase/migrations/202609150001_admin_login_no_lockout.sql`. Na nowej bazie wykonaj go po wcześniejszych migracjach. Zachowuje PIN i aktywne sesje. Samo opublikowanie frontendu nie aktualizuje funkcji w bazie.

### Edycja rytmu stałych dyżurów

Uruchom `supabase/migrations/202609150002_recurring_patterns.sql` po wcześniejszych migracjach. W panelu „Moje stałe dyżury” przycisk ołówka otwiera edycję dnia, godziny, dat i częstotliwości: co 1–12 tygodni lub w wybrane tygodnie miesiąca (1–5 i ostatni). Tydzień 1 oznacza dni 1–7, tydzień 2 dni 8–14 itd.; „ostatni” oznacza ostatnie wystąpienie wybranego dnia tygodnia. Dla cyklu wielotygodniowego pierwsze 7 dni liczy się od daty początku cyklu. Dotychczasowe dyżury pozostają cotygodniowe. Daty graniczne są włączne. Reguły przeliczają też historię; jednorazowe zapisy i nieobecności pozostają.

### Regularne Msze i nabożeństwa — rytmy miesięczne

Uruchom `supabase/migrations/202609150003_mass_patterns.sql` po wcześniejszych migracjach. Formularz serii pozwala wybrać cykl co 1–12 tygodni albo co 1–12 miesięcy, dni tygodnia oraz ich pierwsze, drugie, trzecie, czwarte, piąte lub ostatnie wystąpienie. Wybrane wystąpienia dotyczą każdego zaznaczonego dnia. Cykl tygodniowy liczy 7-dniowe przedziały od daty początku; miesięczny liczy miesiące od miesiąca początku. Zakres jest włączny, maksymalnie 366 dni. Piąte wystąpienie jest pomijane, gdy nie istnieje. Nakładające się wystąpienia nie dublują terminu. Podgląd, tryb demonstracyjny i SQL stosują te same zasady. Seria ma wspólny identyfikator i obsługuje dotychczasową edycję/usuwanie przyszłych terminów.

### Trzecia kategoria wydarzeń

Uruchom `supabase/migrations/202609150004_event_categories.sql` po wcześniejszych migracjach. Dodaje kategorię „Inne” do pojedynczych wydarzeń, regularnych serii i edycji. Dotychczasowe rekordy zachowują kategorię odczytywaną z `is_extra`; nowe zapisy używają jawnej kategorii. Karty pokazują sam napis bez ikony: Msza Św., Nabożeństwo lub Inne.

### Wydarzenia bez określonej liczby osób

Uruchom `supabase/migrations/202609150005_optional_capacity.sql` po wcześniejszych migracjach. Opcja „Bez określonej liczby osób” zapisuje `null` w `suggested_spots`, także dla serii i edycji. Dotychczasowe liczby pozostają zachowane. Wydarzenia bez tej liczby nie są liczone jako mające pełną obsadę. Na kartach wyświetlamy „osoba / osoby / osób”; przy ułamku odmiana odnosi się do liczby docelowej, np. „0/2 osoby”.

### Oznaczenia dnia i okazje pojedynczych Mszy

Uruchom kolejno migracje `202609150006_mass_details.sql` i `202609150007_day_annotations.sql`. Administrator oznacza wybrany dzień przyciskiem „Oznacz dzień” nad listą wydarzeń, również gdy dzień jest pusty. Puste pole usuwa oznaczenie. Znane dotychczasowe rangi (Uroczystość, Święto, Wspomnienie, Wspomnienie dowolne, Niedzielna) są przenoszone z kart do dnia według czasu polskiego. Istniejące oznaczenia dni nie są nadpisywane. Okazja wydarzenia (np. chrzciny) dotyczy tylko edytowanego terminu, nawet przy zmianie całej serii; nowe serie nie kopiują okazji.
