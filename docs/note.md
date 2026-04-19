

analisa ini dan tentukan kpi nya, kemudian contohkan dalam bentuk table markdown


Roas
Budget terserap atau nggak
Shopee -> Raas dan spending
Tiktok -> Roi dan spending dan video materi iklan

video mentingkant tidak otomatis naik

ROAS
Omset

bima bagus bagas



# table ticket issue
id
title
customer_id
subscription_id
assigned_to -> user id
description
status 0 = open, 1 = closed
pending_on -> 0 = advertiser, 1 = css, 2 = client
hold_since
data_json
created_at
updated_at

# table meeting
id
type -> 0 = external, 1 = internal
title
date
customer_id
subscription_id
assigned_to -> user id
members -> string of user ids separated by comma
description
summary -> data json array
action_items -> data json
checklist -> data json array
new_target -> data json array
new_kpi -> data json array of object (key value pair)
data_json
created_at
updated_at




# table todo
id
type -> 0 = performance tracker, 1 = meeting, 2 = ticket issue, 3 = other
title
customer_id
subscription_id
assigned_to -> user id
pic -> 0 = advertiser, 1 = css, 2 = client
performance_tracker_id
meeting_id
ticket_issue_id
description
status 0 = not started, 1 = in progress, 2 = on hold, 3 = completed
sub_task -> data json
checklist -> data json
start_date
due_date
priority -> 0 = low, 1 = medium, 2 = high, 3 = urgent
tags -> string of tags separated by comma
platform -> string
data_json
created_at
updated_at


# table performance_tracker
id
customer_id
subscription_id
assigned_to -> user id
pic -> 0 = advertiser, 1 = css, 2 = client
date
category -> string -> performa, promo, konversi, budget, progres, target dll
description
target_value
actual_value
unit -> string -> 0 = number, 1 = percentage, 2 = currency
achievement_rate
status
action_items -> data json
data_json
notes
created_at
updated_at

# table repeat_performance_tracker
id
performance_tracker_id
type -> 0 = daily, 1 = weekly, 2 = monthly, 3 = yearly
status -> 0 = active, 1 = inactive

# table repeat_task
id
todo_id
type -> 0 = daily, 1 = weekly, 2 = monthly, 3 = yearly
status -> 0 = active, 1 = inactive

# table todo_repeat_history
id
repeat_task_id
type -> 0 = performance tracker, 1 = meeting, 2 = ticket issue, 3 = other
title
customer_id
subscription_id
assigned_to -> user id
pic -> 0 = advertiser, 1 = css, 2 = client
performance_tracker_id
meeting_id
ticket_issue_id
description
status 0 = not started, 1 = in progress, 2 = on hold, 3 = completed
sub_task -> data json
checklist -> data json
start_date
due_date
priority -> 0 = low, 1 = medium, 2 = high, 3 = urgent
tags -> string of tags separated by comma
platform -> string
data_json
created_at
updated_at


Jumlah Hari Iklan Aktif	
Tanggal	
Biaya Iklan LP	
Biaya Iklan CTWA	
ATC  LP	
CTWA Dashboard	
Purchase Dashboard	
Jumlah Chat LP CS	
Jumlah Chat CTWA CS	
Total Closing Chat  LP CS	
Total Closing CTWA CS	
Cost Per ATC LP Dashboard	
Cost Per CTWA Dashboard	
Cost Per Chat  LP CS	
Cost Per Chat  CTWA CS	
Cost Per Closing Chat LP 	
Cost Per Closing Chat CTWA	
Conversion Rate Chat  LP	
Conversion Rate Chat  CTWA	
Omset Chat  LP	
Omset CTWA	
Margin Chat  LP	
Margin Chat CTWA	
Profit Harian Chat LP	
Profit Harian Chat CTWA 	
% Chat Real LP	
% Chat Real CTWA	
Note Advertier	
Note CS		
			