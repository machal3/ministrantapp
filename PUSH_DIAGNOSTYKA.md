# Diagnostyka powiadomień — wykonuj po kolei

Testy lokalne nie potwierdzają konfiguracji wdrożenia ani dostarczenia na telefon.
SQL poniżej tylko odczytuje dane. Wykonuj zapytania osobno w SQL Editor projektu używanego przez opublikowaną stronę. Nie przesyłaj sekretów, adresów endpoint urządzeń ani ich kluczy.

## 1. Wersja strony i projektu

- Opublikuj aktualny frontend. Po zmianie zmiennych VITE wymagany jest nowy build i wdrożenie.
- VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY muszą należeć do projektu, w którym sprawdzasz tabele, funkcję i Cron.
- VITE_VAPID_PUBLIC_KEY musi być obecny podczas budowania strony, również w środowisku produkcyjnym hostingu. Sam lokalny .env nie konfiguruje hostingu.
- VITE_VAPID_PUBLIC_KEY musi być identyczny jak VAPID_PUBLIC_KEY funkcji. VAPID_PRIVATE_KEY musi pochodzić z tej samej wygenerowanej pary.
- Strona musi działać przez HTTPS. Pod /sw.js ma być kod JavaScript, pod /offline.html strona offline, pod /icon-192.png ikona. Odpowiedź HTML aplikacji zamiast sw.js oznacza błędny routing hostingu. Pliki są w public i trafiają do dist podczas buildu.

## 2. Telefon

- Otwórz aplikację z ikony po instalacji. Na iPhonie/iPadzie potrzebny jest system 16.4 lub nowszy oraz aplikacja dodana do ekranu początkowego.
- Sprawdź systemową zgodę na powiadomienia, tryb skupienia/Nie przeszkadzać i połączenie internetowe.
- W panelu Powiadomienia wybierz ministranta, włącz Moja służba i zapisz. Oczekiwany komunikat: Zapisano ustawienia powiadomień.
- Po wdrożeniu poprawki ponownie zapisz ustawienia: zmieniony klucz VAPID spowoduje odtworzenie subskrypcji. Jeśli nadal są problemy, odznacz wszystkie opcje, zapisz, następnie włącz je i zapisz ponownie.
- Zapis ustawień potwierdza rejestrację urządzenia, nie udaną wysyłkę wiadomości.

## 3. Tabele i funkcje

```sql
select to_regclass('liturgy_private.push_subscriptions') as subskrypcje,
       to_regclass('liturgy_private.push_deliveries') as wysylki,
       to_regprocedure('public.save_push_subscription(uuid,text,text,text,uuid,boolean,boolean,boolean)') as zapis,
       to_regprocedure('public.get_push_preferences(uuid)') as odczyt,
       to_regprocedure('public.claim_push_notifications()') as kolejka,
       to_regprocedure('public.finish_push_notification(uuid,uuid,text)') as potwierdzenie;
```

W żadnej kolumnie nie powinno być NULL. Przy brakach wykonaj wcześniejsze migracje, a następnie supabase/migrations/202609150008_push_notifications.sql. Nie udostępniaj liturgy_private w API. Tabele celowo są poza public.

Jeśli tabele istnieją:

```sql
select id, server_id, own, empty_mass, empty_devotion, updated_at
from liturgy_private.push_subscriptions
order by updated_at desc;
```

Po zapisaniu w telefonie powinien pojawić się lub zaktualizować rekord. Brak rekordów oznacza problem na etapie rejestracji; Cron nie tworzy subskrypcji. Instalacja aplikacji i wybór osoby w nagłówku nie wystarczają.

## 4. Edge Function

W Edge Functions sprawdź:

- Nazwa: send-notifications; wdrożony aktualny supabase/functions/send-notifications/index.ts.
- Verify JWT wyłączone tylko dla tej funkcji. Własną autoryzacją jest x-cron-secret.
- Sekrety VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_CRON_SECRET są ustawione.
- VAPID_SUBJECT to rzeczywisty kontakt, np. mailto:kontakt@parafia.pl.
- SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są standardowymi zmiennymi środowiska Supabase; nie kopiuj service-role do frontendu.

W Test wyślij POST z body {} oraz nagłówkami Content-Type: application/json i x-cron-secret o wartości PUSH_CRON_SECRET. Ten test rzeczywiście wysyła aktualnie oczekujące powiadomienia.

Interpretacja:

- 200, sent > 0: dostawca push zaakceptował wysyłkę; to nie potwierdza wyświetlenia przez telefon.
- 200, sent = 0, failed = 0: brak kwalifikujących się wysyłek. Sprawdź etap 7.
- 200, failed > 0: sprawdź Logs i push_delivery_failures.
- 401: JWT nadal włączone albo brak/błędna wartość x-cron-secret.
- 404: błędny URL lub niewdrożona funkcja.
- 500: sprawdź stage w odpowiedzi oraz push_dispatch_failed w Logs.

Po wdrożeniu aktualnego kodu stage wskazuje configuration, claim_push_notifications lub dispatch_or_acknowledgement. Kod PGRST202 zwykle oznacza brak funkcji w API/schema cache. W failureStatuses: 401/403 sugeruje problem autoryzacji u dostawcy (w tym kluczy VAPID), 404/410 oznacza wygasłą subskrypcję, 429 limit dostawcy, 5xx błąd dostawcy. network_or_payload wymaga sprawdzenia połączenia i konfiguracji. Logi nie zawierają endpointów ani sekretów.

## 5. Vault i Cron

W Vault sprawdź push_function_url: pełny URL funkcji w tym projekcie. push_cron_secret musi być identyczny jak PUSH_CRON_SECRET w Secrets funkcji. To dwa osobne miejsca konfiguracji.

```sql
select name, count(*) as liczba,
       bool_and(length(trim(decrypted_secret)) > 0) as niepuste
from vault.decrypted_secrets
where name in ('push_function_url','push_cron_secret')
group by name;
```

Oczekiwane dwa wiersze, każdy z liczba=1 i niepuste=true. Samo zapytanie nie potwierdza zgodności wartości.

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('liturgy-push-every-minute','liturgy-push-every-30-minutes');
```

Oczekiwane jedno aktywne zadanie liturgy-push-every-minute, schedule = * * * * *. Jeśli go brakuje albo jest stary harmonogram, uruchom cały supabase/setup_push_cron.sql.

```sql
select d.start_time, d.end_time, d.status, d.return_message
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname='liturgy-push-every-minute'
order by d.start_time desc limit 10;
```

Oczekiwane regularne uruchomienia co minutę. Succeeded potwierdza tylko wykonanie zadania SQL — żądanie HTTP jest asynchroniczne.

## 6. Odpowiedzi HTTP

```sql
select id, created, status_code, timed_out, error_msg, content
from net._http_response
order by created desc limit 10;
```

Oczekiwane 200 z sent/failed. Ten widok może zawierać odpowiedzi innych integracji, więc dopasuj czas do wywołań funkcji. Wyniki są przechowywane czasowo. timed_out lub error_msg wskazuje problem HTTP. Brak tabel cron/net oznacza brak wymaganych rozszerzeń — tworzy je setup_push_cron.sql.

## 7. Wydarzenie i historia

```sql
select m.id, m.title, m.start_time at time zone 'Europe/Warsaw' as godzina_w_polsce,
       m.category,
       (select count(*) from public.effective_attendees a where a.mass_id=m.id) as zapisani
from public.masses m
where m.start_time > now() and m.start_time <= now()+interval '30 minutes'
order by m.start_time;
```

Wydarzenie musi być w tym oknie. Dla Moja służba server_id z subskrypcji musi występować w effective_attendees dla wydarzenia. Wybrana osoba w panelu powiadomień może być inna niż w nagłówku. Stałe dyżury i zgłoszone nieobecności są uwzględniane. Alert pustej Mszy/nabożeństwa wymaga zera zapisanych osób i odpowiedniej kategorii. Puste Inne nie generuje alertu.

```sql
select mass_id, subscription_id, kind, attempts, sent_at, lease_until
from liturgy_private.push_deliveries
order by start_time desc limit 20;
```

sent_at ustawione oznacza zakończoną wysyłkę (również pominiętą, gdy wydarzenie zaczęło się podczas przetwarzania). Kolejne uruchomienie nie wysyła jej ponownie. attempts=3 i sent_at=NULL oznacza wyczerpanie prób; użyj nowego wydarzenia do testu po naprawie. Nie uruchamiaj ręcznie claim_push_notifications do podglądu — rezerwuje zadania.

## 8. Test końcowy

Utwórz nowe wydarzenie 31 minut w przyszłości. Zapisz na nie osobę wybraną w panelu, włącz Moja służba i zapisz ustawienia. Około 30 minut przed wydarzeniem sprawdź wywołanie funkcji, sent/failed i historię wysyłki. Możesz też utworzyć nowe wydarzenie 5–10 minut w przyszłości, by sprawdzić dostarczanie przy najbliższym uruchomieniu Cron.

Do dalszej diagnozy wystarczą: dokładny komunikat aplikacji, obecność rekordu subskrypcji, wynik Cron, status i body odpowiedzi funkcji oraz stage/failureStatuses. Nie przesyłaj kluczy, sekretów ani endpointów urządzeń.

Dokumentacja: [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Cron](https://supabase.com/docs/guides/cron), [logi funkcji](https://supabase.com/docs/guides/functions/logging), [Web Push na iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
