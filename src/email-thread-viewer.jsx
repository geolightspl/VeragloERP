/* Email thread viewer and reply interface for enquiries */
(function (VG) {
  const { useState, useEffect } = React;
  const ui = VG.ui, fx = VG.fx;
  const { Icon, Button, Card } = ui;
  const { Field, Text, Area, Modal } = fx;

  function EmailThreadViewer({ enquiry, onClose }) {
    const [replies, setReplies] = useState(enquiry?.emailThread || []);
    const [composing, setComposing] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [attachFile, setAttachFile] = useState(null);
    const [sending, setSending] = useState(false);

    async function sendReply() {
      if (!replyText.trim()) {
        VG.toast("Reply cannot be empty", "warn");
        return;
      }

      setSending(true);
      try {
        const formData = new FormData();
        formData.append("enquiryId", enquiry.id);
        formData.append("reply", replyText);
        formData.append("recipientEmail", enquiry.contactEmail);
        if (attachFile) formData.append("attachment", attachFile);

        const res = await fetch("/api/email-integration/send-reply", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Failed to send reply");

        VG.toast("Reply sent successfully");
        setReplyText("");
        setAttachFile(null);
        setComposing(false);

        // Add to thread
        setReplies([
          ...replies,
          {
            id: "reply_" + Date.now(),
            date: new Date().toISOString(),
            from: "system",
            subject: "RE: " + enquiry.subject,
            body: replyText,
            type: "outgoing",
          },
        ]);
      } catch (e) {
        VG.toast(e.message, "error");
      } finally {
        setSending(false);
      }
    }

    return (
      <Modal open={!!enquiry} onClose={onClose} title="Email Thread" className="w-full max-w-2xl">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {replies.length === 0 ? (
            <div className="text-center py-8 opacity-60">
              <Icon name="mail" size={32} className="mx-auto mb-2" />
              <p>No email thread</p>
            </div>
          ) : (
            replies.map((email) => (
              <Card
                key={email.id}
                className={
                  "p-3 rounded-lg " +
                  (email.type === "outgoing" ? "bg-blue-500/10 border-blue-500/30" : "bg-white/5")
                }
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-medium">{email.from}</p>
                    <p className="text-xs opacity-60">
                      {new Date(email.date).toLocaleString()}
                    </p>
                  </div>
                  {email.type === "outgoing" && (
                    <span className="text-xs bg-blue-500/30 px-2 py-1 rounded">Sent</span>
                  )}
                </div>
                <p className="text-xs font-mono mt-2 opacity-70">{email.subject}</p>
                <div className="text-sm mt-2 whitespace-pre-wrap">{email.body}</div>
              </Card>
            ))
          )}
        </div>

        {composing ? (
          <div className="mt-4 space-y-3 pt-4 border-t border-white/10">
            <Area
              rows={4}
              value={replyText}
              onChange={setReplyText}
              placeholder="Type your reply..."
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                icon="send"
                onClick={sendReply}
                loading={sending}
                disabled={!replyText.trim()}
              >
                Send Reply
              </Button>
              <Button variant="soft" onClick={() => setComposing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button icon="mail" variant="soft" onClick={() => setComposing(true)}>
              Reply by Email
            </Button>
            <Button icon="file" variant="soft">
              Send PDF
            </Button>
          </div>
        )}
      </Modal>
    );
  }

  /**
   * Email source badge for enquiry details
   */
  function EmailSourceBadge({ enquiry }) {
    if (!enquiry?.emailSourceMessageId) return null;

    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-xs">
        <Icon name="mail" size={12} />
        <span>Email source</span>
      </div>
    );
  }

  VG.EmailThreadViewer = EmailThreadViewer;
  VG.EmailSourceBadge = EmailSourceBadge;
})(window.VG);
