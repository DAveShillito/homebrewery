/* eslint-disable max-lines */
require('./editPage.less');
const React = require('react');
const createClass = require('create-react-class');
const _ = require('lodash');
const cx = require('classnames');
const request = require('superagent');
const { Meta } = require('vitreum/headtags');

const Nav = require('naturalcrit/nav/nav.jsx');
const Navbar = require('../../navbar/navbar.jsx');

const ReportIssue = require('../../navbar/issue.navitem.jsx');
const PrintLink = require('../../navbar/print.navitem.jsx');
const Account = require('../../navbar/account.navitem.jsx');
const RecentNavItem = require('../../navbar/recent.navitem.jsx').both;

const SplitPane = require('naturalcrit/splitPane/splitPane.jsx');
const Editor = require('../../editor/editor.jsx');
const BrewRenderer = require('../../brewRenderer/brewRenderer.jsx');

const Markdown = require('naturalcrit/markdown.js');

const googleDriveActive = require('../../googleDrive.png');
const googleDriveInactive = require('../../googleDriveMono.png');

const SAVE_TIMEOUT = 3000;

const EditPage = createClass({
	getDefaultProps : function() {
		return {
			brew : {
				text      : '',
				shareId   : null,
				editId    : null,
				createdAt : null,
				updatedAt : null,
				gDrive    : false,

				title       : '',
				description : '',
				tags        : '',
				published   : false,
				authors     : [],
				systems     : []
			}
		};
	},

	getInitialState : function() {
		return {
			brew : this.props.brew,

			isSaving   : false,
			isPending  : false,
			saveGoogle : this.props.brew.googleId ? true : false,
			errors     : null,
			htmlErrors : Markdown.validate(this.props.brew.text),
			url        : ''
		};
	},
	savedBrew : null,

	componentDidMount : function(){
		this.setState({
			url : window.location.href
		});

		this.trySave();
		window.onbeforeunload = ()=>{
			if(this.state.isSaving || this.state.isPending){
				return 'You have unsaved changes!';
			}
		};

		this.setState((prevState)=>({
			htmlErrors : Markdown.validate(prevState.brew.text)
		}));

		document.addEventListener('keydown', this.handleControlKeys);
	},
	componentWillUnmount : function() {
		window.onbeforeunload = function(){};
		document.removeEventListener('keydown', this.handleControlKeys);
	},

	handleControlKeys : function(e){
		if(!(e.ctrlKey || e.metaKey)) return;
		const S_KEY = 83;
		const P_KEY = 80;
		if(e.keyCode == S_KEY) this.save();
		if(e.keyCode == P_KEY) window.open(`/print/${this.props.brew.shareId}?dialog=true`, '_blank').focus();
		if(e.keyCode == P_KEY || e.keyCode == S_KEY){
			e.stopPropagation();
			e.preventDefault();
		}
	},

	handleSplitMove : function(){
		this.refs.editor.update();
	},

	handleMetadataChange : function(metadata){
		this.setState((prevState)=>({
			brew      : _.merge({}, prevState.brew, metadata),
			isPending : true,
		}), ()=>this.trySave());

	},

	handleTextChange : function(text){

		//If there are errors, run the validator on everychange to give quick feedback
		let htmlErrors = this.state.htmlErrors;
		if(htmlErrors.length) htmlErrors = Markdown.validate(text);

		this.setState((prevState)=>({
			brew       : _.merge({}, prevState.brew, { text: text }),
			isPending  : true,
			htmlErrors : htmlErrors
		}), ()=>this.trySave());
	},

	hasChanges : function(){
		const savedBrew = this.savedBrew ? this.savedBrew : this.props.brew;
		return !_.isEqual(this.state.brew, savedBrew);
	},

	trySave : function(){
		if(!this.debounceSave) this.debounceSave = _.debounce(this.save, SAVE_TIMEOUT);
		if(this.hasChanges()){
			this.debounceSave();
		} else {
			this.debounceSave.cancel();
		}
	},

	toggleGoogleStorage : function(){
		this.setState((prevState)=>({
			saveGoogle : !prevState.saveGoogle,
			isSaving   : false,
			errors     : null
		}), ()=>this.trySave());
	},

	save : async function(){
		if(this.debounceSave && this.debounceSave.cancel) this.debounceSave.cancel();

		this.setState((prevState)=>({
			isSaving   : true,
			errors     : null,
			htmlErrors : Markdown.validate(prevState.brew.text)
		}));

		const transfer = this.state.saveGoogle == _.isNil(this.state.brew.googleId);

		if(this.state.saveGoogle) {
			if(transfer) {
				const res = await request
				.post('/api/newGoogle/')
				.send(this.state.brew)
				.catch((err)=>{
					console.log(err.status === 401
						? 'Not signed in!'
						: 'Error Saving to Google!');
					this.setState({ errors: err });
				});

				if(!res) { return; }

				console.log('Deleting Local Copy');
				await request.delete(`/api/${this.state.brew.editId}`)
				.send()
				.catch((err)=>{
					console.log('Error deleting Local Copy');
				});

				this.savedBrew = res.body;
				history.replaceState(null, null, `/edit/${this.savedBrew.googleId}${this.savedBrew.editId}`); //update URL to match doc ID
			} else {
				const res = await request
				.put(`/api/updateGoogle/${this.state.brew.editId}`)
				.send(this.state.brew)
				.catch((err)=>{
					console.log(err.status === 401
						? 'Not signed in!'
						: 'Error Saving to Google!');
					this.setState({ errors: err });
					return;
				});

				this.savedBrew = res.body;
			}
		} else {
			console.log('Saving Locally');
			if(transfer) {
				console.log('Moving to Local Storage');
				const res = await request.post('/api')
				.send(this.state.brew)
				.catch((err)=>{
					console.log('Error creating Local Copy');
					this.setState({ errors: err });
					return;
				});

				await request.get(`/api/removeGoogle/${this.state.brew.googleId}${this.state.brew.editId}`)
				.send()
				.catch((err)=>{
					console.log('Error Deleting Google Brew');
				});

				console.log('GOT THIS SAVED BREW:');
				console.log(res);
				this.savedBrew = res.body;
				history.replaceState(null, null, `/edit/${this.savedBrew.editId}`); //update URL to match doc ID
			} else {
				console.log('Updating existing local copy');
				const res = await request
				.put(`/api/update/${this.state.brew.editId}`)
				.send(this.state.brew)
				.catch((err)=>{
					console.log('Error Updating Local Brew');
					this.setState({ errors: err });
					return;
				});

				this.savedBrew = res.body;
			}
		}

		console.log('Finished saving. About to merge saved brew with current');
		this.setState((prevState)=>({
			brew : _.merge({}, prevState.brew, {
				googleId : this.savedBrew.googleId ? this.savedBrew.googleId : null,
				editId 	 : this.savedBrew.editId,
			}),
			isPending : false,
			isSaving  : false,
		}));
	},

	renderGoogleDriveIcon : function(){
		if(this.state.saveGoogle) {
			return <Nav.item className='googleDriveStorage' onClick={this.toggleGoogleStorage}>
				<img src={googleDriveActive} alt='googleDriveActive' />
			</Nav.item>;
		} else {
			return <Nav.item className='googleDriveStorage' onClick={this.toggleGoogleStorage}>
				<img src={googleDriveInactive} alt='googleDriveInactive' />
			</Nav.item>;
		}

	},

	renderSaveButton : function(){
		if(this.state.errors){
			let errMsg = '';
			try {
				errMsg += `${this.state.errors.toString()}\n\n`;
				errMsg += `\`\`\`\n${JSON.stringify(this.state.errors.response.error, null, '  ')}\n\`\`\``;
			} catch (e){}

			if(this.state.errors.status == '401'){
				return <Nav.item className='save error' icon='fa-warning'>
					Oops!
					<div className='errorContainer'>
					You must be signed in to a Google account
						to save this to Google Drive!<br />
						Sign in <a target='_blank' rel='noopener noreferrer'
							href={`http://naturalcrit.com/login?redirect=${this.state.url}`}>
						here</a>.
					</div>
				</Nav.item>;
			}

			return <Nav.item className='save error' icon='fa-warning'>
				Oops!
				<div className='errorContainer'>
					Looks like there was a problem saving. <br />
					Report the issue <a target='_blank' rel='noopener noreferrer'
						href={`https://github.com/stolksdorf/naturalcrit/issues/new?body=${encodeURIComponent(errMsg)}`}>
						here
					</a>.
				</div>
			</Nav.item>;
		}

		if(this.state.isSaving){
			return <Nav.item className='save' icon='fa-spinner fa-spin'>saving...</Nav.item>;
		}
		if(this.state.isPending && this.hasChanges()){
			return <Nav.item className='save' onClick={this.save} color='blue' icon='fa-save'>Save Now</Nav.item>;
		}
		if(!this.state.isPending && !this.state.isSaving){
			return <Nav.item className='save saved'>saved.</Nav.item>;
		}
	},

	renderNavbar : function(){
		return <Navbar>
			<Nav.section>
				<Nav.item className='brewTitle'>{this.state.brew.title}</Nav.item>
			</Nav.section>

			<Nav.section>
				{this.renderGoogleDriveIcon()}
				{this.renderSaveButton()}
				<ReportIssue />
				<Nav.item newTab={true} href={`/share/${this.props.brew.shareId}`} color='teal' icon='fa-share-alt'>
					Share
				</Nav.item>
				<PrintLink shareId={this.props.brew.shareId} />
				<RecentNavItem brew={this.props.brew} storageKey='edit' />
				<Account />
			</Nav.section>
		</Navbar>;
	},

	render : function(){
		return <div className='editPage page'>
			<Meta name='robots' content='noindex, nofollow' />
			{this.renderNavbar()}

			<div className='content'>
				<SplitPane onDragFinish={this.handleSplitMove} ref='pane'>
					<Editor
						ref='editor'
						value={this.state.brew.text}
						onChange={this.handleTextChange}
						metadata={this.state.brew}
						onMetadataChange={this.handleMetadataChange}
					/>
					<BrewRenderer text={this.state.brew.text} errors={this.state.htmlErrors} />
				</SplitPane>
			</div>
		</div>;
	}
});

module.exports = EditPage;
